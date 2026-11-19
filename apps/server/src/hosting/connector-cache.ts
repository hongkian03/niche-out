import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, lstat, readFile, writeFile, rename, rm, link, mkdtemp } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve, win32 } from 'node:path';
import { request as httpsRequest, Agent as HttpsAgent } from 'node:https';
import { gunzipSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';

export type ConnectorPreparationStage = 'checking' | 'waiting' | 'downloading' | 'verifying';
export interface ConnectorPreparationProgress { stage: ConnectorPreparationStage; receivedBytes?: number; totalBytes?: number }
interface Target { url: string; bytes: number; archiveSha256: string; executableSha256: string; archive: 'tgz' | 'executable' }
export interface PrepareConnectorOptions {
  manifestPath: string; signal?: AbortSignal; onProgress?: (progress: ConnectorPreparationProgress) => void;
  /** Trusted embedding/test seams. Never supplied by browser requests. */
  cacheRoot?: string; target?: string;
  download?: (url: URL, signal: AbortSignal) => Promise<AsyncIterable<Uint8Array>>;
  verifyVersion?: (path: string, version: string, signal: AbortSignal) => Promise<void>;
  timeoutMs?: number;
}
export class ConnectorPreparationError extends Error {
  constructor(readonly code: 'connector-cache' | 'connector-download' | 'connector-integrity' | 'connector-version' | 'unsupported-platform') {
    super({ 'connector-cache': 'Cannot prepare the tunnel cache. Check your user cache permissions and retry.', 'connector-download': 'Tunnel download failed. Check internet, proxy and trusted certificate settings, then retry.', 'connector-integrity': 'Tunnel component verification failed. No unverified executable was run. Retry preparation.', 'connector-version': 'The tunnel executable could not run or reported an unexpected version. Check executable permissions and retry.', 'unsupported-platform': 'No pinned tunnel component is available for this operating system and Node architecture.' }[code]);
    this.name = 'ConnectorPreparationError';
  }
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
export function connectorCacheRoot(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  let value: string;
  if (platform === 'win32') {
    if (!env.LOCALAPPDATA || !win32.isAbsolute(env.LOCALAPPDATA)) throw new ConnectorPreparationError('connector-cache');
    value = win32.join(env.LOCALAPPDATA, 'NicheOut', 'Cache');
  } else if (platform === 'darwin') value = join(home, 'Library', 'Caches', 'NicheOut');
  else {
    if (env.XDG_CACHE_HOME && !isAbsolute(env.XDG_CACHE_HOME)) throw new ConnectorPreparationError('connector-cache');
    value = join(env.XDG_CACHE_HOME || join(home, '.cache'), 'niche-out');
  }
  if (!(platform === 'win32' ? win32.isAbsolute(value) : isAbsolute(value))) throw new ConnectorPreparationError('connector-cache');
  return value;
}
/** Per-agent proxy support, separate from npm registry configuration. Normal Node
 * CA validation includes startup NODE_EXTRA_CA_CERTS; TLS is never disabled. */
export async function downloadConnector(url: URL, signal: AbortSignal, redirects = 0): Promise<AsyncIterable<Uint8Array>> {
  if (url.protocol !== 'https:' || redirects > 5 || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new ConnectorPreparationError('connector-download');
  const agent = new HttpsAgent({ proxyEnv: process.env, keepAlive: false });
  return new Promise((accept, reject) => {
    const req = httpsRequest(url, { signal, agent, headers: { 'User-Agent': 'Niche-Out-connector-prepare' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode ?? 0) && res.headers.location) {
        res.resume(); agent.destroy();
        void downloadConnector(new URL(res.headers.location, url), signal, redirects + 1).then(accept, reject); return;
      }
      if (res.statusCode !== 200) { res.resume(); agent.destroy(); reject(new ConnectorPreparationError('connector-download')); return; }
      res.once('close', () => agent.destroy()); accept(res);
    });
    req.once('error', () => { agent.destroy(); reject(new ConnectorPreparationError('connector-download')); }); req.end();
  });
}
/** Strict single-file extraction; no filesystem path is taken from the tar. */
export function extractConnectorArchive(bytes: Buffer): Buffer {
  let tar: Buffer;
  try { tar = gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }); } catch { throw new ConnectorPreparationError('connector-integrity'); }
  let offset = 0, executable: Buffer | undefined;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (!executable || tar.subarray(offset).some(byte => byte !== 0)) throw new ConnectorPreparationError('connector-integrity');
      return executable;
    }
    const text = (start: number, end: number) => header.subarray(start, end).toString('utf8').replace(/\0.*$/s, '');
    const rawSize = text(124, 136).trim(), rawChecksum = text(148, 156).trim();
    if (!/^[0-7]+$/.test(rawSize) || !/^[0-7]+$/.test(rawChecksum)) throw new ConnectorPreparationError('connector-integrity');
    const size = parseInt(rawSize, 8), checksum = [...header].reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    if (checksum !== parseInt(rawChecksum, 8) || text(0, 100) !== 'cloudflared' || text(345, 500) !== '' || ![0, 48].includes(header[156]!) || executable || size < 1 || offset + 512 + size > tar.length) throw new ConnectorPreparationError('connector-integrity');
    executable = tar.subarray(offset + 512, offset + 512 + size); offset += 512 + Math.ceil(size / 512) * 512;
  }
  throw new ConnectorPreparationError('connector-integrity');
}
async function version(path: string, expected: string, signal: AbortSignal): Promise<void> {
  await new Promise<void>((accept, reject) => execFile(path, ['--version'], { signal, timeout: 5000, maxBuffer: 4096, windowsHide: true }, (error, stdout) => {
    if (error || !stdout.trim().startsWith('cloudflared version ' + expected + ' ')) reject(new ConnectorPreparationError('connector-version')); else accept();
  }));
}
async function directory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const info = await lstat(path);
  if (info.isSymbolicLink() || !info.isDirectory() || (process.platform !== 'win32' && (info.mode & 0o022) !== 0)) throw new ConnectorPreparationError('connector-cache');
}
async function fileBytes(path: string, signal: AbortSignal): Promise<Buffer | null> {
  try {
    const info = await lstat(path); if (info.isSymbolicLink() || !info.isFile()) throw new ConnectorPreparationError('connector-cache');
    return await readFile(path, { signal });
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; } };
export async function prepareConnector(options: PrepareConnectorOptions): Promise<string> {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 120000), signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const progress = (stage: ConnectorPreparationStage, receivedBytes?: number, totalBytes?: number) => { try { options.onProgress?.({ stage, ...(receivedBytes === undefined ? {} : { receivedBytes, totalBytes }) }); } catch { /* Observer does not affect verification. */ } };
  let temporary: string | undefined, lock: string | undefined, nonce = '';
  const verifyVersion = async (path: string, expected: string, context: AbortSignal) => {
    try { await (options.verifyVersion ?? version)(path, expected, context); }
    catch (error) { if (context.aborted) throw error; throw new ConnectorPreparationError('connector-version'); }
  };
  try {
    signal.throwIfAborted(); progress('checking');
    const manifest = JSON.parse(await readFile(options.manifestPath, { encoding: 'utf8', signal }));
    const targetName = options.target ?? process.platform + '-' + process.arch, target: Target | undefined = manifest.platforms?.[targetName];
    if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(manifest.version) || !['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64'].includes(targetName) || !target) throw new ConnectorPreparationError('unsupported-platform');
    if (!Number.isSafeInteger(target.bytes) || target.bytes < 1 || target.bytes > 128 * 1024 * 1024 || !['tgz', 'executable'].includes(target.archive) || !/^[a-f0-9]{64}$/.test(target.archiveSha256) || !/^[a-f0-9]{64}$/.test(target.executableSha256) || new URL(target.url).protocol !== 'https:') throw new ConnectorPreparationError('connector-integrity');
    const root = resolve(options.cacheRoot ?? connectorCacheRoot());
    if (options.cacheRoot && !isAbsolute(options.cacheRoot)) throw new ConnectorPreparationError('connector-cache');
    await directory(root); let entry = root;
    for (const part of ['cloudflared', manifest.version, targetName, target.executableSha256]) { entry = join(entry, part); await directory(entry); }
    const executable = join(entry, targetName.startsWith('win32') ? 'cloudflared.exe' : 'cloudflared');
    const warm = async () => { const bytes = await fileBytes(executable, signal); if (!bytes || hash(bytes) !== target.executableSha256) return false; await verifyVersion(executable, manifest.version, signal); return true; };
    if (await warm()) return executable;
    const lockPath = join(entry, 'prepare.lock');
    for (;;) {
      signal.throwIfAborted();
      try {
        // Link a fully written record atomically; a crash cannot leave an empty
        // published lock with no PID/nonce from which ownership can be checked.
        nonce = randomUUID(); const candidate = join(entry, '.lock-' + nonce);
        try {
          await writeFile(candidate, JSON.stringify({ pid: process.pid, nonce, created: Date.now() }), { mode: 0o600, flag: 'wx' });
          await link(candidate, lockPath);
        } finally { await rm(candidate, { force: true }).catch(() => {}); }
        lock = lockPath; break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        let info;
        try { info = await lstat(lockPath); } catch (missing) { if ((missing as NodeJS.ErrnoException).code === 'ENOENT') continue; throw missing; }
        if (info.isSymbolicLink() || !info.isFile()) throw new ConnectorPreparationError('connector-cache');
        let owner: { pid?: number; nonce?: string; created?: number } = {};
        try { owner = JSON.parse(await readFile(lockPath, 'utf8')); } catch { /* A new lock may not be written yet. */ }
        if (Number.isSafeInteger(owner.pid) && owner.pid! > 0 && !alive(owner.pid!) && typeof owner.nonce === 'string') {
          try {
            const latest = JSON.parse(await readFile(lockPath, 'utf8'));
            if (latest.nonce === owner.nonce) await rm(lockPath);
          } catch (missing) { if ((missing as NodeJS.ErrnoException).code !== 'ENOENT') throw missing; }
          continue;
        }
        progress('waiting'); await delay(100, undefined, { signal }); if (await warm()) return executable;
      }
    }
    if (await warm()) return executable;
    temporary = await mkdtemp(join(entry, '.download-'));
    const chunks: Buffer[] = []; let received = 0; progress('downloading', 0, target.bytes);
    try {
      const body = await (options.download ?? downloadConnector)(new URL(target.url), signal);
      for await (const chunk of body) { signal.throwIfAborted(); received += chunk.length; if (received > target.bytes) throw new ConnectorPreparationError('connector-integrity'); chunks.push(Buffer.from(chunk)); progress('downloading', received, target.bytes); }
    } catch (error) { if (signal.aborted || error instanceof ConnectorPreparationError) throw error; throw new ConnectorPreparationError('connector-download'); }
    const archive = Buffer.concat(chunks); progress('verifying');
    if (received !== target.bytes || hash(archive) !== target.archiveSha256) throw new ConnectorPreparationError('connector-integrity');
    const binary = target.archive === 'tgz' ? extractConnectorArchive(archive) : archive;
    if (hash(binary) !== target.executableSha256) throw new ConnectorPreparationError('connector-integrity');
    const pending = join(temporary, targetName.startsWith('win32') ? 'cloudflared.exe' : 'cloudflared'); await writeFile(pending, binary, { mode: 0o700, flag: 'wx', signal });
    await verifyVersion(pending, manifest.version, signal); signal.throwIfAborted(); await rename(pending, executable);
    return executable;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof ConnectorPreparationError) throw error;
    throw new ConnectorPreparationError('connector-cache');
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true }).catch(() => {});
    if (lock) try { const owner = JSON.parse(await readFile(lock, 'utf8')); if (owner.nonce === nonce) await rm(lock); } catch { /* No lock owned by this operation remains. */ }
  }
}
