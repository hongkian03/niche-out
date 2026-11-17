import { createPreferredSocket } from './transport.js';
import { z } from 'zod';
import {
  completeView, continuationRecord, failure, hostOperation, httpRoutes, protocolLimits,
  serverEvents, sessionRequest, sessionResponse, socketAcknowledgements, socketCommands,
  type CommandName, type CompleteView, type SessionResponse,
} from '@rarity/contracts';

export type ClientStatus = 'idle' | 'discovering' | 'connecting' | 'connected' | 'reconnecting' |
  'superseded' | 'removed' | 'closed' | 'host-conflict' | 'host-revoked' | 'error';
export interface ClientError { code: string; message: string; fieldErrors?: { path: (string | number)[]; message: string }[] }
export type Candidate = z.infer<(typeof httpRoutes)['POST /api/host/import']['success']>;
type HostOperation = z.infer<typeof hostOperation>;
type RecapDetail = NonNullable<Extract<CompleteView, { phase: 'Finished' }>['requestedDetail']>;
export interface ClientSnapshot {
  session: SessionResponse | null;
  view: CompleteView | null;
  status: ClientStatus;
  error: ClientError | null;
  pending: { kind: 'join' | 'answer' | 'start' | 'remove' | 'upload' | 'commit' | 'claim' | 'recap'; label: string } | null;
  candidate: Candidate | null;
  controlGeneration: number | null;
  clockOffsetMs: number;
  answerFeedback: { roundId: string; status: 'checking' | 'confirming' | 'accepted' | 'rejected'; submittedText: string; message?: string } | null;
  recapCache: Record<string, RecapDetail['results']>;
}
// Small ports keep protocol/recovery tests independent of a DOM or a live tunnel.
export interface ClientSocket {
  connected: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  connect(): unknown;
  disconnect(): unknown;
  removeAllListeners(): unknown;
  timeout(ms: number): { emit(event: string, body: unknown, ack: (error: Error | null, value?: unknown) => void): unknown };
}
export interface ClientOptions {
  fetch?: typeof fetch;
  socket?: (auth: { protocolVersion: 2; serverInstanceId: string; tabId: string }) => ClientSocket;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  now?: () => number;
  random?: () => number;
  ownerToken?: () => string | null;
  clearOwnerToken?: () => void;
}
const CONTINUATION_KEY = 'niche.continuation.v1';
const OPERATION_KEY = 'niche.host-operation.v1';
const terminal = new Set<ClientStatus>(['removed', 'closed', 'host-conflict', 'host-revoked']);
class ClientFault extends Error {
  constructor(readonly detail: ClientError, readonly uncertain = false) { super(detail.message); }
}
const transportFault = () => new ClientFault({ code: 'TRANSPORT', message: 'Connection interrupted. Reconnecting to confirm the current game.' }, true);
const initial = (): ClientSnapshot => ({ session: null, view: null, status: 'idle', error: null, pending: null,
  candidate: null, controlGeneration: null, clockOffsetMs: 0, answerFeedback: null, recapCache: {} });

/** The server owns membership, acceptance, phase transitions, scores and every displayed game view. */
export class GameClient {
  #state = initial();
  #listeners = new Set<() => void>();
  #fetch: typeof fetch;
  #socketFactory: NonNullable<ClientOptions['socket']>;
  #storage: ClientOptions['storage'];
  #now: () => number;
  #random: () => number;
  #options: ClientOptions;
  #socket: ClientSocket | null = null;
  #sequence = 0;
  #epoch = 0;
  #gameId: string | null = null;
  #firstConnect = true;
  #explicitClaim = false;
  #controlFence = -1;
  #connectAttempts = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #clockTimer: ReturnType<typeof setTimeout> | undefined;
  #clockGeneration = 0;
  #clockBest: { rtt: number; offset: number; at: number } | null = null;
  #pendingHost: HostOperation | null = null;
  #resolving = false;
  #connectionTask: Promise<void> | null = null;
  #disposed = false;
  #action = 0;
  #hasClockAnchor = false;

  constructor(options: ClientOptions = {}) {
    this.#options = options;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#socketFactory = options.socket ?? createPreferredSocket;
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? Date.now;
    try { this.#storage = options.storage === undefined ? globalThis.sessionStorage : options.storage; }
    catch { this.#storage = null; }
  }
  getSnapshot = (): ClientSnapshot => this.#state;
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };
  #set(patch: Partial<ClientSnapshot>) { if (patch.status && patch.status !== 'connected') this.#stopClock(); this.#state = { ...this.#state, ...patch }; for (const listener of this.#listeners) listener(); }
  #begin(pending: NonNullable<ClientSnapshot['pending']>) { const action = ++this.#action; this.#set({ pending, error: null }); return action; }
  #end(action: number) { if (action === this.#action) this.#set({ pending: null }); }
  clearError = () => this.#set({ error: null });
  discardCandidate = () => { if (!this.#state.pending) this.#set({ candidate: null, error: null }); };
  #saved(key: string): unknown {
    const value = this.#storage?.getItem(key); return value ? JSON.parse(value) as unknown : null;
  }
  #save(key: string, value: unknown) {
    try { if (value === null) this.#storage?.removeItem(key); else this.#storage?.setItem(key, JSON.stringify(value)); } catch { /* Storage loss never manufactures fresh authority. */ }
  }
  #page(): z.infer<typeof sessionRequest>['page'] {
    if (!this.#storage) return { kind: 'unavailable' };
    try {
      const saved = this.#saved(CONTINUATION_KEY);
      if (!saved) return { kind: 'fresh' };
      const parsed = continuationRecord.safeParse(saved);
      return parsed.success ? { kind: 'continuation', record: parsed.data } : { kind: 'ambiguous' };
    } catch { return { kind: 'ambiguous' }; }
  }
  #context() {
    const session = this.#state.session;
    if (!session) throw transportFault();
    return { protocolVersion: 2 as const, serverInstanceId: session.serverInstanceId, tabId: session.tabId,
      requestId: `${session.requestPrefix}.${++this.#sequence}` };
  }
  #body(name: CommandName, payload: unknown = {}, extra: Record<string, unknown> = {}) {
    return socketCommands[name].parse({ ...this.#context(), gameId: this.#gameId, payload, ...extra });
  }
  async #http<T>(path: string, body: unknown, schema: z.ZodType<T>, raw = false, method: 'POST' | 'GET' = 'POST'): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), raw ? 15000 : 5000);
    try {
      const response = await this.#fetch(path, { method, credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' },
        ...(method === 'POST' ? { body: raw ? body as BodyInit : JSON.stringify(body) } : {}), signal: controller.signal });
      // HTML provider/quota pages are never interpreted as an application verdict.
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw transportFault();
      let value: unknown;
      try { value = await response.json(); } catch { throw transportFault(); }
      const error = failure.safeParse(value);
      if (error.success) throw new ClientFault(error.data);
      if (!response.ok) throw transportFault();
      const parsed = schema.safeParse(value);
      if (!parsed.success) throw new ClientFault({ code: 'INVALID_RESPONSE', message: 'The server returned an incompatible response. Retry the connection.' }, true);
      return parsed.data;
    } catch (error) { if (error instanceof ClientFault) throw error; throw transportFault(); }
    finally { clearTimeout(timer); }
  }
  #fault(error: unknown) {
    const fault = error instanceof ClientFault ? error : transportFault();
    const code = fault.detail.code;
    let status = this.#state.status;
    if (code === 'REMOVED') status = 'removed';
    else if (code === 'HOST_PLAYER_CONFLICT') status = 'host-conflict';
    else if (code === 'TAB_SUPERSEDED' || code === 'CONTROL_CONFIRMATION_REQUIRED') status = 'superseded';
    else if (code === 'WRONG_INSTANCE' || code === 'WRONG_GAME') status = 'closed';
    else if (code === 'HOST_REVOKED') status = 'host-revoked';
    else if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') status = this.#state.session?.role === 'host' ? 'host-revoked' : 'closed';
    this.#set({ error: fault.detail, status });
    if (terminal.has(status) || status === 'superseded') { clearTimeout(this.#timer); this.#socket?.disconnect(); }
  }
  boot = async (): Promise<void> => this.#discover();
  async #discover(page?: z.infer<typeof sessionRequest>['page']): Promise<void> {
    if (this.#state.status === 'discovering' || this.#state.status === 'connecting') return;
    this.#disposed = false;
    const epoch = ++this.#epoch;
    this.#stopTransport();
    this.#hasClockAnchor = false;
    this.#set({ status: 'discovering', error: null });
    let token: string | null = null;
    try {
      token = this.#options.ownerToken?.() ?? (typeof location !== 'undefined' && location.pathname === '/host' ? location.hash.slice(1) || null : null);
      const discovery = token
        ? await this.#http('/api/owner/exchange', { protocolVersion: 2, token }, httpRoutes['POST /api/owner/exchange'].success)
        : await this.#http('/api/session', { protocolVersion: 2, page: page ?? this.#page() }, sessionResponse);
      if (epoch !== this.#epoch || this.#disposed) return;
      if (token) {
        if (this.#options.clearOwnerToken) this.#options.clearOwnerToken();
        else if (typeof history !== 'undefined') history.replaceState(null, '', location.pathname + location.search);
      }
      const previous = this.#state.session;
      if (previous && previous.serverInstanceId !== discovery.serverInstanceId) {
        this.#set({ session: discovery, view: null, candidate: null, recapCache: {}, answerFeedback: null });
        throw new ClientFault({ code: 'WRONG_INSTANCE', message: 'This hosting session ended. Use the host’s new invitation to join a fresh game.' });
      }
      this.#sequence = 0;
      this.#gameId = discovery.membership?.gameId ?? discovery.hostGameId;
      this.#set({ session: discovery, controlGeneration: null });
      if (previous?.role === 'host' && discovery.role !== 'host') throw new ClientFault({ code: 'HOST_REVOKED', message: 'Host access expired. Use Open host page in the local launcher to restore it.' });
      if (previous?.role === 'player' && discovery.role === 'guest') throw new ClientFault({ code: 'WRONG_GAME', message: 'This browser cannot recover its admitted player. Nickname alone cannot restore access. Ask the host for a fresh game invitation.' });
      if (discovery.role === 'player' && discovery.membership.status === 'removed') throw new ClientFault({ code: 'REMOVED', message: 'The host removed you from this game.' });
      if (discovery.role === 'host') {
        try { const op = hostOperation.safeParse(this.#saved(OPERATION_KEY)); if (op.success) this.#pendingHost = op.data; }
        catch { this.#save(OPERATION_KEY, null); }
      }
      this.#firstConnect = true;
      this.#set({ status: discovery.resume === 'confirmation-required' ? 'superseded' : 'connecting' });
      this.#createSocket();
      if (discovery.resume !== 'confirmation-required') this.#socket?.connect();
    } catch (error) {
      if (epoch !== this.#epoch || this.#disposed) return;
      this.#fault(error);
      if (this.getSnapshot().status === 'discovering') {
        this.#set({ status: 'error' });
        if (error instanceof ClientFault && error.uncertain) this.#schedule(() => void this.boot());
      }
    }
  }
  #createSocket() {
    const session = this.#state.session!;
    const socket = this.#socketFactory({ protocolVersion: 2, serverInstanceId: session.serverInstanceId, tabId: session.tabId });
    this.#socket = socket;
    socket.on('connect', () => { this.#connectionTask = this.#connected(); });
    for (const event of ['state.snapshot', 'state.changed'] as const) socket.on(event, value => this.#acceptView(value));
    socket.on('player.superseded', value => {
      const parsed = serverEvents['player.superseded'].safeParse(value);
      if (!parsed.success || parsed.data.serverInstanceId !== session.serverInstanceId || parsed.data.tabId !== session.tabId || parsed.data.gameId !== this.#gameId || parsed.data.revision < (this.#state.view?.revision ?? 0)) return;
      this.#controlFence = Math.max(this.#controlFence, parsed.data.controlGeneration);
      ++this.#action;
      this.#set({ status: 'superseded', pending: null, error: null });
      socket.disconnect();
    });
    socket.on('game.closed', value => {
      const parsed = serverEvents['game.closed'].safeParse(value);
      if (!parsed.success || parsed.data.serverInstanceId !== session.serverInstanceId || parsed.data.gameId !== this.#gameId || parsed.data.revision < (this.#state.view?.revision ?? 0)) return;
      if (session.role === 'host' && parsed.data.reason === 'replaced') return;
      ++this.#action;
      this.#set({ status: 'closed', pending: null, candidate: null, recapCache: {},
        error: { code: 'GAME_CLOSED', message: parsed.data.reason === 'replaced' ? 'The host created a new game. Use the new invitation to join.' : 'This hosting session ended. Ask the host to start fresh hosting and share a new invitation.' } });
      socket.disconnect();
    });
    socket.on('disconnect', (reason: string) => {
      if (this.#disposed || terminal.has(this.#state.status) || this.#state.status === 'superseded') return;
      this.#set({ status: 'reconnecting' });
      if (reason === 'io server disconnect') void this.#inspectDisconnected();
      else this.#schedule(() => socket.connect());
    });
    socket.on('connect_error', (error: { data?: unknown }) => {
      const parsed = failure.safeParse(error.data);
      if (parsed.success) this.#fault(new ClientFault(parsed.data));
      if (!terminal.has(this.#state.status) && this.#state.status !== 'superseded') {
        this.#set({ status: 'reconnecting' }); this.#schedule(() => socket.connect());
      }
    });
  }
  #schedule(action: () => void) {
    clearTimeout(this.#timer);
    if (this.#disposed || terminal.has(this.#state.status) || this.#state.status === 'superseded') return;
    if (this.#connectAttempts >= 5) {
      this.#set({ status: 'error', error: { code: 'TRANSPORT', message: 'The host is unreachable. Check your internet connection and retry. If hosting ended, ask for a new invitation.' } }); return;
    }
    const base = Math.min(1000 * 2 ** this.#connectAttempts++, 15000);
    const delay = base * (0.5 + this.#randomUnit() / 2);
    this.#timer = setTimeout(action, delay);
  }
  async #inspectDisconnected() {
    try {
      // Inspect the existing page; bootstrap would allocate a second page and
      // discard its authority, eventually exhausting the registered-page limit.
      const session = this.#state.session!;
      const query = new URLSearchParams({ serverInstanceId: session.serverInstanceId, tabId: session.tabId,
        ...(this.#gameId ? { gameId: this.#gameId } : {}) });
      const result = await this.#http('/api/snapshot?' + query, undefined, completeView, false, 'GET');
      if (this.#state.status === 'superseded' || this.#disposed) return;
      this.#acceptView(result);
      this.#schedule(() => this.#socket?.connect());
    } catch (error) { this.#fault(error); this.#schedule(() => this.#socket?.connect()); }
  }
  #recoverTransport() {
    if (terminal.has(this.#state.status) || this.#state.status === 'superseded' || this.#disposed) return;
    this.#set({ status: 'reconnecting' });
    this.#schedule(() => { if (this.#socket?.connected) void this.#connected(); else this.#socket?.connect(); });
  }
  async #connected() {
    try {
      if (!this.#explicitClaim && this.#gameId) {
        const result = await this.#send('game.resume', this.#body('game.resume', { mode: this.#firstConnect ? 'bootstrap' : 'loaded' }) as z.infer<(typeof socketCommands)['game.resume']>);
        this.#grant(result);
      }
      this.#firstConnect = false;
      if (this.#explicitClaim) return;
      if (this.#pendingHost) await this.#resolveHost();
      if (this.#gameId || this.#state.session?.role === 'host') await this.#readState();
      this.#reconcileAnswer();
      if (terminal.has(this.#state.status) || this.#state.status === 'superseded') return;
      this.#connectAttempts = 0;
      this.#set({ status: 'connected', error: this.#pendingHost ? this.#state.error : null });
      this.#startClock();
    } catch (error) { this.#fault(error); this.#recoverTransport(); }
  }
  async #send<N extends CommandName>(name: N, body: z.infer<(typeof socketCommands)[N]>, current = () => true): Promise<z.infer<(typeof socketAcknowledgements)[N]>> {
    const epoch = this.#epoch;
    for (let attempt = 0; attempt <= protocolLimits.identicalRetries; attempt++) {
      if (epoch !== this.#epoch || this.#disposed || !current()) throw transportFault();
      try {
        const raw = await new Promise<unknown>((resolve, reject) => {
          if (!this.#socket?.connected) return reject(transportFault());
          this.#socket.timeout(protocolLimits.acknowledgementMs).emit(name, body, (error, value) => error ? reject(transportFault()) : resolve(value));
        });
        if (epoch !== this.#epoch || this.#disposed || !current()) throw transportFault();
        const parsed = socketAcknowledgements[name].safeParse(raw);
        if (!parsed.success || parsed.data.requestId !== body.requestId) throw transportFault();
        if ('code' in parsed.data) throw new ClientFault(parsed.data);
        if (name !== 'game.join' && parsed.data.gameId !== body.gameId) throw transportFault();
        return parsed.data as z.infer<(typeof socketAcknowledgements)[N]>;
      } catch (error) {
        if (error instanceof ClientFault && !error.uncertain) throw error;
        if (attempt === protocolLimits.identicalRetries) throw transportFault();
      }
    }
    throw transportFault();
  }
  #grant(value: unknown) {
    const result = value as { gameId: string; control?: { controlGeneration: number; continuation: unknown } | null };
    if (!result.control) return true;
    const proof = continuationRecord.safeParse(result.control.continuation), session = this.#state.session;
    if (!proof.success || proof.data.serverInstanceId !== session?.serverInstanceId || proof.data.previousTabId !== session.tabId || proof.data.gameId !== result.gameId) return false;
    if (result.control.controlGeneration < (this.#state.controlGeneration ?? 0) || result.control.controlGeneration <= this.#controlFence || (this.#state.status === 'superseded' && !this.#explicitClaim)) return false;
    this.#gameId = result.gameId;
    this.#save(CONTINUATION_KEY, result.control.continuation);
    this.#set({ controlGeneration: result.control.controlGeneration });
    return true;
  }
  #acceptView(raw: unknown) {
    const parsed = completeView.safeParse(raw);
    if (!parsed.success || !this.#state.session || terminal.has(this.#state.status) || this.#state.status === 'superseded') return;
    const view = parsed.data, previous = this.#state.view;
    if (view.serverInstanceId !== this.#state.session.serverInstanceId) return;
    if ((this.#state.session.role === 'host') !== (view.viewRole === 'host')) return;
    if (previous && (view.revision < previous.revision || (view.revision === previous.revision && view.phaseId !== previous.phaseId))) return;
    if (this.#state.session.role !== 'host' && view.gameId !== this.#gameId) return;
    if (view.viewRole === 'player' && this.#state.session.role === 'player' && view.ownPlayer.playerId !== this.#state.session.membership.playerId) return;
    if (view.viewRole === 'player' && (view.phase === 'Reading' || view.phase === 'Answering') &&
      (view.controlGeneration < (this.#state.controlGeneration ?? 0) || view.controlGeneration < this.#controlFence)) return;
    const changedGame = previous?.gameId !== view.gameId;
    if (view.viewRole === 'player' && this.#state.session.role === 'guest') {
      const { protocolVersion, serverInstanceId, tabId, requestPrefix } = this.#state.session;
      this.#set({ session: { protocolVersion, serverInstanceId, tabId, requestPrefix, role: 'player', hostGameId: null, lastGameCommit: null, resume: 'fresh', membership: { ...view.ownPlayer, gameId: view.gameId, status: 'admitted' } } });
    }
    this.#gameId = view.gameId;
    let answerFeedback = this.#state.answerFeedback;
    if (changedGame || (answerFeedback && answerFeedback.roundId !== view.roundId) || view.phase !== 'Answering') answerFeedback = null;
    if (view.viewRole === 'player' && view.phase === 'Answering' && view.ownAnswer.locked) answerFeedback = { roundId: view.roundId, status: 'accepted', submittedText: view.ownAnswer.submittedText };
    const recapCache = changedGame ? {} : this.#state.recapCache;
    // Server deadlines use its monotonic clock, not browser Date.now(). Anchor
    // the first authorized view before rendering it; RTT samples refine this
    // estimate later. Broadcast arrival times never replace a refined offset.
    if (changedGame) { this.#stopClock(); this.#hasClockAnchor = false; }
    const clockOffsetMs = this.#hasClockAnchor ? this.#state.clockOffsetMs : view.serverNowMs - this.#now();
    this.#hasClockAnchor = true;
    this.#set({ view, answerFeedback, clockOffsetMs, candidate: changedGame || view.phase === 'Reading' || view.phase === 'Answering' || view.phase === 'Results' ? null : this.#state.candidate, recapCache: view.phase === 'Finished' && view.requestedDetail ? { ...recapCache, [view.requestedDetail.roundId]: view.requestedDetail.results } : recapCache });
    if (changedGame && previous && this.#state.status === 'connected') this.#startClock();
  }
  #reconcileAnswer() {
    const view = this.#state.view, feedback = this.#state.answerFeedback;
    if (feedback?.status === 'confirming' && view?.viewRole === 'player' && view.phase === 'Answering' && view.roundId === feedback.roundId && !view.ownAnswer.locked) this.#set({ answerFeedback: { ...feedback, status: 'rejected', message: 'No answer is locked. You can submit again while time remains.' } });
  }
  async #readState(recapRoundId?: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const requestedGame = this.#gameId;
      try {
        const result = await this.#send('state.get', this.#body('state.get', recapRoundId ? { recapRoundId } : {}) as z.infer<(typeof socketCommands)['state.get']>);
        if ('view' in result) this.#acceptView(result.view);
        return;
      } catch (error) {
        // Another host page can replace a game while this read is in flight.
        // A late verdict about the old game must not close the new host view.
        if (this.#state.session?.role === 'host' && requestedGame !== this.#gameId && error instanceof ClientFault && error.detail.code === 'WRONG_GAME') {
          if (recapRoundId) return;
          continue;
        }
        throw error;
      }
    }
    throw transportFault();
  }
  #randomUnit() { return Math.max(0, Math.min(1, this.#random())); }
  #stopClock() {
    clearTimeout(this.#clockTimer);
    ++this.#clockGeneration;
    this.#clockBest = null;
  }
  #startClock() {
    this.#stopClock();
    if (this.#state.status !== 'connected' || (!this.#gameId && this.#state.session?.role !== 'host')) return;
    const generation = this.#clockGeneration, game = this.#gameId, epoch = this.#epoch;
    const current = () => generation === this.#clockGeneration && game === this.#gameId && epoch === this.#epoch && !this.#disposed && this.#state.status === 'connected';
    let sampleIndex = 0;
    const batch = async (first: boolean) => {
      let firstCompleted = 0;
      const followups = [250 + this.#randomUnit() * 500, 1000 + this.#randomUnit() * 1000];
      const sample = async (index: number): Promise<void> => {
        if (!current()) return;
        try {
          const sent = this.#now(), sampleId = `sample-${generation}-${++sampleIndex}`;
          const result = await this.#send('clock.sample', this.#body('clock.sample', { sampleId }) as z.infer<(typeof socketCommands)['clock.sample']>, current);
          if (!current()) return;
          const received = this.#now();
          if ('serverNowMs' in result && result.sampleId === sampleId) {
            const rtt = received - sent, offset = result.serverNowMs - (sent + received) / 2;
            if (Number.isFinite(rtt) && Number.isFinite(offset) && rtt >= 0 && (!this.#clockBest || received - this.#clockBest.at > 60000 || rtt < this.#clockBest.rtt)) {
              this.#clockBest = { rtt, offset, at: received };
              this.#set({ clockOffsetMs: offset });
            }
          }
        } catch { /* A failed sample never changes game authority. */ }
        if (!current()) return;
        if (index === 0) firstCompleted = this.#now();
        if (index < 2) this.#clockTimer = setTimeout(() => void sample(index + 1), Math.max(0, followups[index]! - (this.#now() - firstCompleted)));
        else this.#clockTimer = setTimeout(() => void batch(false), first ? 30000 + this.#randomUnit() * 5000 : 27000 + this.#randomUnit() * 6000);
      };
      await sample(0);
    };
    void batch(true);
  }
  #canMutate() { return this.#state.status === 'connected' && !this.#state.pending && !this.#pendingHost; }
  join = async (code: string, nickname: string): Promise<void> => {
    if (!this.#canMutate() || this.#state.session?.role !== 'guest') return;
    const action = this.#begin({ kind: 'join', label: 'Joining…' });
    try {
      const result = await this.#send('game.join', this.#body('game.join', { code, nickname }) as z.infer<(typeof socketCommands)['game.join']>);
      this.#grant(result);
      await this.#readState();
      if (this.#state.status === 'connected') this.#startClock();
    } catch (error) {
      if (error instanceof ClientFault && error.uncertain) {
        if (this.#gameId) { this.#fault(error); this.#recoverTransport(); }
        else {
          // All join acknowledgements can be lost after admission. Discover the
          // membership conservatively, without pretending this is a fresh tab.
          this.#set({ status: 'reconnecting' }); await this.#discover({ kind: 'ambiguous' });
        }
      } else this.#fault(error);
    }
    finally { this.#end(action); }
  };
  submit = async (text: string): Promise<void> => {
    const view = this.#state.view;
    if (!this.#canMutate() || view?.viewRole !== 'player' || view.phase !== 'Answering' || view.ownAnswer.locked ||
      this.#state.controlGeneration === null || this.#now() + this.#state.clockOffsetMs >= view.phaseDeadlineMs) return;
    const roundId = view.roundId;
    const gameId = view.gameId, action = this.#begin({ kind: 'answer', label: 'Checking answer…' });
    const current = () => this.#action === action && this.#state.view?.gameId === gameId && this.#state.view?.roundId === roundId && this.#state.view?.phase === 'Answering' && this.#state.status !== 'superseded' && !terminal.has(this.#state.status);
    this.#set({ answerFeedback: { roundId, status: 'checking', submittedText: text } });
    try {
      const result = await this.#send('answer.submit', this.#body('answer.submit', { text }, { roundId, controlGeneration: this.#state.controlGeneration }) as z.infer<(typeof socketCommands)['answer.submit']>);
      if (!current() || ('roundId' in result && result.roundId !== roundId)) return;
      if ('locked' in result) this.#set({ answerFeedback: { roundId, status: result.locked ? 'accepted' : 'rejected', submittedText: result.locked ? result.submittedText : text } });
    } catch (error) {
      if (!current()) return;
      if (error instanceof ClientFault && error.uncertain) {
        this.#set({ answerFeedback: { roundId, status: 'confirming', submittedText: text } });
        try {
          await this.#readState();
          const restored = this.#state.view;
          if (current() && restored?.viewRole === 'player' && restored.phase === 'Answering' && !restored.ownAnswer.locked) this.#set({ answerFeedback: { roundId, status: 'rejected', submittedText: text, message: 'No answer is locked. You can submit again while time remains.' } });
        } catch (recoveryError) { if (current()) { this.#fault(recoveryError); this.#recoverTransport(); } }
      } else {
        this.#fault(error); this.#set({ answerFeedback: null });
        if (error instanceof ClientFault && ['WRONG_ROUND', 'NOT_ANSWERING', 'EXPIRED', 'WRONG_PHASE'].includes(error.detail.code)) {
          try { await this.#readState(); } catch (syncError) { this.#fault(syncError); this.#recoverTransport(); }
        }
      }
    } finally { this.#end(action); }
  };
  upload = async (file: File): Promise<void> => {
    if (!this.#canMutate() || this.#state.session?.role !== 'host') return;
    if (file.size > protocolLimits.uploadBytes) { this.#set({ error: { code: 'UPLOAD_TOO_LARGE', message: 'Choose a JSON file no larger than 10 MiB.' } }); return; }
    const action = this.#begin({ kind: 'upload', label: 'Checking file…' });
    this.#set({ candidate: null });
    try {
      const candidate = await this.#http('/api/host/import', file, httpRoutes['POST /api/host/import'].success, true);
      const view = this.#state.view;
      if (action !== this.#action || this.#disposed || terminal.has(this.#state.status)) return;
      if (candidate.serverInstanceId !== this.#state.session?.serverInstanceId || !view || !('setupGeneration' in view) ||
        candidate.expectedGameId !== view.gameId || candidate.expectedSetupGeneration !== view.setupGeneration) {
        throw new ClientFault({ code: 'CANDIDATE_STALE', message: 'The game changed while this file was checked. Validate the file again before replacing the current game.' });
      }
      this.#set({ candidate });
    } catch (error) { this.#fault(error); }
    finally { this.#end(action); }
  };
  commit = async (): Promise<void> => {
    if (!this.#canMutate() || !this.#state.candidate || this.#state.session?.role !== 'host') return;
    const candidate = this.#state.candidate;
    const original = httpRoutes['POST /api/host/games'].request.parse({ ...this.#context(), candidateId: candidate.candidateId,
      expectedGameId: candidate.expectedGameId, expectedSetupGeneration: candidate.expectedSetupGeneration });
    await this.#hostMutation({ kind: 'game.commit', original });
  };
  start = async (): Promise<void> => {
    if (!this.#canMutate() || this.#state.view?.viewRole !== 'host' || this.#state.view.phase !== 'Lobby') return;
    await this.#hostMutation({ kind: 'game.start', original: this.#body('game.start') as z.infer<(typeof socketCommands)['game.start']> });
  };
  remove = async (targetPlayerId: string): Promise<void> => {
    if (!this.#canMutate() || this.#state.session?.role !== 'host' || !this.#gameId) return;
    await this.#hostMutation({ kind: 'player.remove', original: this.#body('player.remove', { targetPlayerId }) as z.infer<(typeof socketCommands)['player.remove']> });
  };
  async #hostMutation(operation: HostOperation) {
    this.#pendingHost = operation; this.#save(OPERATION_KEY, operation);
    this.#set({ pending: { kind: operation.kind === 'game.commit' ? 'commit' : operation.kind === 'game.start' ? 'start' : 'remove', label: 'Confirming game…' }, error: null });
    try {
      if (operation.kind === 'game.commit') {
        let done = false;
        for (let attempt = 0; attempt <= protocolLimits.identicalRetries; attempt++) {
          try {
            const result = await this.#http('/api/host/games', operation.original, httpRoutes['POST /api/host/games'].success);
            if (result.requestId !== operation.original.requestId || result.candidateId !== operation.original.candidateId) throw transportFault();
            if (result.revision >= (this.#state.view?.revision ?? -1)) this.#gameId = result.gameId;
            this.#set({ candidate: null }); done = true; break;
          } catch (error) { if (!(error instanceof ClientFault) || !error.uncertain) throw error; }
        }
        if (!done) throw transportFault();
      } else await this.#send(operation.kind, operation.original);
      this.#finishHost();
      await this.#readState();
    } catch (error) {
      const requestedGame = operation.kind === 'game.commit' ? operation.original.expectedGameId : operation.original.gameId;
      if (error instanceof ClientFault && (error.uncertain || (error.detail.code === 'WRONG_GAME' && requestedGame !== this.#gameId))) {
        if (this.#pendingHost) await this.#resolveHost();
        else { this.#fault(error); this.#recoverTransport(); }
      }
      else { this.#fault(error); this.#finishHost(); if (error instanceof ClientFault && ['CANDIDATE_EXPIRED', 'CANDIDATE_STALE'].includes(error.detail.code)) this.#set({ candidate: null }); }
    }
  }
  #finishHost() { this.#pendingHost = null; this.#save(OPERATION_KEY, null); this.#set({ pending: null }); }
  async #resolveHost() {
    if (!this.#pendingHost || this.#resolving) return;
    this.#resolving = true;
    const operation = this.#pendingHost;
    this.#set({ pending: { kind: operation.kind === 'game.commit' ? 'commit' : operation.kind === 'game.start' ? 'start' : 'remove', label: 'Confirming game…' } });
    try {
      const result = await this.#http('/api/host/operations/resolve', { protocolVersion: 2, operation }, httpRoutes['POST /api/host/operations/resolve'].success);
      if (result.outcome === 'APPLIED' && result.result.requestId !== operation.original.requestId) throw transportFault();
      this.#acceptView(result.view);
      this.#finishHost();
      this.#set({ candidate: operation.kind === 'game.commit' ? null : this.#state.candidate,
        error: result.outcome === 'APPLIED' ? null : { code: result.outcome, message: result.outcome === 'NOT_APPLIED'
          ? 'The operation was not applied. Review the current game before trying again.' : 'The game changed before this operation could be confirmed. Review the current game.' } });
      if (this.#state.status === 'error' || this.#state.status === 'reconnecting') {
        if (this.#socket?.connected) { this.#set({ status: 'connected' }); this.#startClock(); }
        else this.#recoverTransport();
      }
    } catch (error) {
      this.#fault(error);
      if (!terminal.has(this.#state.status)) this.#schedule(() => void this.#resolveHost());
    } finally { this.#resolving = false; }
  }
  claimControl = async (): Promise<void> => {
    if (this.#state.status !== 'superseded' || !this.#gameId || this.#state.pending) return;
    this.#explicitClaim = true;
    const action = this.#begin({ kind: 'claim', label: 'Taking control…' });
    try {
      if (!this.#socket?.connected) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(transportFault()), 10000);
          this.#socket?.on('connect', () => { clearTimeout(timer); resolve(); });
          this.#socket?.on('connect_error', () => { clearTimeout(timer); reject(transportFault()); });
          this.#socket?.connect();
        });
      }
      const result = await this.#send('player.claimControl', this.#body('player.claimControl', { explicit: true }) as z.infer<(typeof socketCommands)['player.claimControl']>);
      if (action !== this.#action || !this.#grant(result)) return;
      this.#set({ status: 'connecting' }); await this.#readState();
      if (action !== this.#action || terminal.has(this.#state.status) || this.getSnapshot().status === 'superseded') return;
      this.#set({ status: 'connected' });
      this.#startClock();
    } catch (error) { this.#fault(error); }
    finally { this.#explicitClaim = false; this.#end(action); }
  };
  recap = async (roundId: string): Promise<void> => {
    if (!this.#canMutate() || this.#state.view?.phase !== 'Finished' || this.#state.recapCache[roundId]) return;
    const action = this.#begin({ kind: 'recap', label: 'Loading round…' });
    try { await this.#readState(roundId); } catch (error) { this.#fault(error); }
    finally { this.#end(action); }
  };
  retry = async (): Promise<void> => {
    if (terminal.has(this.#state.status) || this.#state.status === 'superseded') return;
    this.#connectAttempts = 0; this.#set({ error: null });
    if (this.#pendingHost) { await this.#resolveHost(); return; }
    if (!this.#state.session) { await this.boot(); return; }
    if (!this.#socket?.connected) { this.#set({ status: 'reconnecting' }); this.#socket?.connect(); }
    else await this.#connected();
  };
  #stopTransport() { clearTimeout(this.#timer); this.#stopClock(); this.#socket?.removeAllListeners(); this.#socket?.disconnect(); this.#socket = null; }
  dispose = () => { this.#disposed = true; ++this.#epoch; this.#stopTransport(); this.#listeners.clear(); };
}
