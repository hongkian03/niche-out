import { randomUUID } from 'node:crypto';
import { getHeapStatistics } from 'node:v8';
import { Worker } from 'node:worker_threads';
import { httpRoutes, protocolLimits } from '@rarity/contracts';
import { hydrateTrustedCompiledPack, type CompiledPack, type CompiledPackTransfer, type GameEngine } from '@rarity/game-core';

const MiB = 1024 ** 2;
export const importDefaults = Object.freeze({
  uploadBytes: protocolLimits.uploadBytes, timeoutMs: 10_000, workerHeapMiB: 256,
  candidateLifetimeMs: 300_000, processHeadroomBytes: 256 * MiB,
  parentHeapHeadroomBytes: 128 * MiB, byteMultiplier: 8,
});
export type ImportCode = 'UPLOAD_TOO_LARGE' | 'INVALID_PACK' | 'IMPORT_IN_PROGRESS' |
  'IMPORT_TIMEOUT' | 'IMPORT_CAPACITY' | 'WRONG_PHASE' | 'CANDIDATE_EXPIRED' | 'CANDIDATE_STALE';
export class ImportError extends Error {
  constructor(readonly code: ImportCode, message: string,
    readonly fieldErrors?: { path: (string | number)[]; message: string }[]) {
    super(message); this.name = 'ImportError';
  }
}
export interface ImportTicket {
  readonly id: string;
  readonly expectedGameId: string | null;
  readonly expectedSetupGeneration: number;
}
interface Candidate extends ImportTicket { definition: CompiledPack; expiresAtMs: number }
export interface ImportMetrics {
  bytes: number; elapsedMs: number; workerStarted: boolean;
  baselineRssBytes: number; peakRssBytes: number; parentPeakHeapBytes: number;
  workerPeakHeapBytes: number; transferRssBytes: number;
}
export interface ImportOptions {
  now?: () => number;
  newId?: () => string;
  capacity?: () => { availableBytes: number | undefined; parentHeapBytes: number | undefined };
  timeoutMs?: number;
  candidateLifetimeMs?: number;
  /** Trusted server configuration, never accepted from a browser. */
  workerUrl?: URL;
}
type Engine = Pick<GameEngine, 'state' | 'advanceSetupGeneration'>;
const error = (code: ImportCode, message: string) => new ImportError(code, message);
// Fixed stage labels only: never log uploaded content, worker messages or credentials.
function workerFailure(stage: string, message: string): ImportError {
  console.error('[niche:import]', JSON.stringify({ stage, node: process.version }));
  return error('IMPORT_CAPACITY', message + ' Check the host terminal diagnostics.');
}

/** One upload/worker or one staged candidate. Authentication belongs to the route. */
export class ImportService {
  #active?: ImportTicket;
  #candidate?: Candidate;
  #worker?: Worker;
  #cancelWorker?: () => void;
  #closed = false;
  #processing = false;
  #metrics?: ImportMetrics;
  readonly #now: () => number;
  readonly #newId: () => string;
  readonly #capacity: NonNullable<ImportOptions['capacity']>;
  constructor(private readonly engine: Engine, private readonly options: ImportOptions = {}) {
    this.#now = options.now ?? (() => performance.now());
    this.#newId = options.newId ?? randomUUID;
    this.#capacity = options.capacity ?? (() => ({
      availableBytes: process.availableMemory(), parentHeapBytes: getHeapStatistics().total_available_size,
    }));
  }
  get busy(): boolean { return this.#active !== undefined; }
  get lastMetrics(): Readonly<ImportMetrics> | undefined { return this.#metrics && Object.freeze({ ...this.#metrics }); }

  begin(): ImportTicket {
    if (this.#closed) throw error('CANDIDATE_STALE', 'The hosting session has ended.');
    if (this.busy) throw error('IMPORT_IN_PROGRESS', 'Another upload is being validated.');
    if (!['Setup', 'Lobby', 'Finished'].includes(this.engine.state().phase)) {
      throw error('WRONG_PHASE', 'Upload a game before play or after the game finishes.');
    }
    const id = this.#newId();
    const changed = this.engine.advanceSetupGeneration();
    if (!changed.ok) throw error('WRONG_PHASE', 'Game setup is unavailable.');
    this.#candidate = undefined;
    this.#active = Object.freeze({ id, expectedGameId: this.engine.state().gameId,
      expectedSetupGeneration: changed.setupGeneration });
    return this.#active;
  }
  abort(ticket: ImportTicket): void {
    if (this.#active !== ticket) return;
    if (this.#processing) this.#cancelWorker?.();
    else this.#active = undefined;
  }
  async importBytes(bytes: Uint8Array) { return this.complete(this.begin(), bytes); }

  async complete(ticket: ImportTicket, bytes: Uint8Array) {
    if (this.#active !== ticket || this.#closed) throw error('CANDIDATE_STALE', 'This upload is no longer current.');
    if (this.#processing) throw error('IMPORT_IN_PROGRESS', 'This upload is already being validated.');
    if (!(bytes instanceof Uint8Array)) {
      this.#active = undefined;
      throw error('INVALID_PACK', 'Upload a JSON game file.');
    }
    this.#processing = true;
    const started = this.#now();
    const baseline = process.memoryUsage();
    const metrics: ImportMetrics = { bytes: bytes.byteLength, elapsedMs: 0, workerStarted: false,
      baselineRssBytes: baseline.rss, peakRssBytes: baseline.rss, parentPeakHeapBytes: baseline.heapUsed,
      workerPeakHeapBytes: 0, transferRssBytes: 0 };
    this.#metrics = metrics;
    try {
      if (bytes.byteLength > importDefaults.uploadBytes) throw error('UPLOAD_TOO_LARGE', 'Game files must be no larger than 10 MiB.');
      const capacity = this.#capacity();
      if (!Number.isFinite(capacity.availableBytes) || capacity.availableBytes! < importDefaults.processHeadroomBytes + 8 * bytes.byteLength ||
          !Number.isFinite(capacity.parentHeapBytes) || capacity.parentHeapBytes! < importDefaults.parentHeapHeadroomBytes + 8 * bytes.byteLength) {
        console.error('[niche:import]', JSON.stringify({
          stage: 'memory-precheck', node: process.version, uploadBytes: bytes.byteLength,
          availableBytes: capacity.availableBytes ?? null,
          requiredAvailableBytes: importDefaults.processHeadroomBytes + 8 * bytes.byteLength,
          parentHeapBytes: capacity.parentHeapBytes ?? null,
          requiredParentHeapBytes: importDefaults.parentHeapHeadroomBytes + 8 * bytes.byteLength,
        }));
        throw error('IMPORT_CAPACITY', 'The host memory check could not confirm enough available memory. Check the host terminal diagnostics.');
      }
      // A dedicated backing buffer avoids detaching a caller-owned Buffer pool.
      const owned = Uint8Array.from(bytes);
      const definition = await this.#compile(owned, metrics);
      const state = this.engine.state();
      if (this.#closed || this.#active !== ticket || state.setupGeneration !== ticket.expectedSetupGeneration ||
          state.gameId !== ticket.expectedGameId || !['Setup', 'Lobby', 'Finished'].includes(state.phase)) {
        throw error('CANDIDATE_STALE', 'Game setup changed during validation.');
      }
      this.#candidate = { ...ticket, definition, expiresAtMs: this.#now() + (this.options.candidateLifetimeMs ?? importDefaults.candidateLifetimeMs) };
      return httpRoutes['POST /api/host/import'].success.parse({
        serverInstanceId: state.serverInstanceId, candidateId: ticket.id,
        expectedGameId: ticket.expectedGameId, expectedSetupGeneration: ticket.expectedSetupGeneration,
        summary: { title: definition.title, promptCount: definition.prompts.length,
          settings: { ...definition.settings }, tiers: definition.tiers.map(tier => ({ name: tier.name, points: tier.points })) },
      });
    } finally {
      metrics.elapsedMs = this.#now() - started;
      const memory = process.memoryUsage();
      metrics.peakRssBytes = Math.max(metrics.peakRssBytes, memory.rss);
      metrics.parentPeakHeapBytes = Math.max(metrics.parentPeakHeapBytes, memory.heapUsed);
      if (this.#active === ticket) this.#active = undefined;
      this.#processing = false;
    }
  }

  async #compile(bytes: Uint8Array<ArrayBuffer>, metrics: ImportMetrics): Promise<CompiledPack> {
    let worker: Worker;
    try {
      worker = new Worker(this.options.workerUrl ?? new URL(import.meta.url.endsWith('.ts') ? './import-worker.ts' : './import-worker.js', import.meta.url), {
        workerData: { bytes }, transferList: [bytes.buffer], resourceLimits: { maxOldGenerationSizeMb: importDefaults.workerHeapMiB },
      });
    } catch { throw workerFailure('worker-start', 'The validation worker could not start.'); }
    this.#worker = worker; metrics.workerStarted = true;
    const sample = () => {
      const memory = process.memoryUsage();
      metrics.peakRssBytes = Math.max(metrics.peakRssBytes, memory.rss);
      metrics.parentPeakHeapBytes = Math.max(metrics.parentPeakHeapBytes, memory.heapUsed);
      return memory;
    };
    const sampler = setInterval(sample, 5);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await new Promise<CompiledPack>((resolve, reject) => {
        let received = false;
        this.#cancelWorker = () => reject(error('CANDIDATE_STALE', 'This upload was cancelled.'));
        timer = setTimeout(() => reject(error('IMPORT_TIMEOUT', 'Game validation timed out. Try a smaller file.')),
          this.options.timeoutMs ?? importDefaults.timeoutMs);
        worker.on('message', (message: { kind: string; memory?: NodeJS.MemoryUsage; definition?: CompiledPackTransfer; fieldErrors?: ImportError['fieldErrors'] }) => {
          const memory = sample();
          if (message.kind === 'sample' && message.memory) {
            metrics.peakRssBytes = Math.max(metrics.peakRssBytes, message.memory.rss);
            metrics.workerPeakHeapBytes = Math.max(metrics.workerPeakHeapBytes, message.memory.heapUsed);
          } else if (message.kind === 'invalid') {
            received = true;
            reject(new ImportError('INVALID_PACK', 'The game file is invalid.', message.fieldErrors));
          } else if (message.kind === 'compiled' && message.definition) {
            received = true;
            try {
              const definition = hydrateTrustedCompiledPack(message.definition);
              metrics.transferRssBytes = Math.max(memory.rss, sample().rss);
              resolve(definition);
            } catch { reject(workerFailure('compiled-load', 'The compiled game could not be loaded.')); }
          }
        });
        worker.once('error', () => reject(workerFailure('worker-error', 'The validation worker could not complete.')));
        worker.once('exit', () => { if (!received) reject(workerFailure('worker-exit', 'The validation worker exited before completing.')); });
      });
    } finally {
      clearTimeout(timer); clearInterval(sampler); this.#cancelWorker = undefined;
      await worker.terminate();
      if (this.#worker === worker) this.#worker = undefined;
    }
  }

  candidateForCommit(candidateId: string, expectedGameId: string | null, expectedSetupGeneration: number): CompiledPack {
    if (this.busy) throw error('IMPORT_IN_PROGRESS', 'An upload is still being validated.');
    const candidate = this.#candidate;
    if (!candidate || candidate.id !== candidateId) throw error('CANDIDATE_STALE', 'Validate and review the game file again.');
    if (this.#now() >= candidate.expiresAtMs) {
      this.#candidate = undefined;
      throw error('CANDIDATE_EXPIRED', 'The validated file expired. Validate it again.');
    }
    const state = this.engine.state();
    if (candidate.expectedGameId !== expectedGameId || candidate.expectedSetupGeneration !== expectedSetupGeneration ||
        state.gameId !== expectedGameId || state.setupGeneration !== expectedSetupGeneration ||
        !['Setup', 'Lobby', 'Finished'].includes(state.phase)) {
      throw error('CANDIDATE_STALE', 'Game setup changed. Validate and review the file again.');
    }
    return candidate.definition;
  }
  consume(candidateId: string): void { if (this.#candidate?.id === candidateId) this.#candidate = undefined; }
  clearCandidate(): void { this.#candidate = undefined; }
  invalidate(): void { this.clearCandidate(); this.engine.advanceSetupGeneration(); }
  async close(): Promise<void> {
    this.#closed = true; this.#candidate = undefined;
    this.#cancelWorker?.();
    if (this.#worker) await this.#worker.terminate();
    this.#active = undefined;
  }
}
