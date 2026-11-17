import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { sessionRequest, sessionResponse, type SessionResponse, type controlGrant } from '@rarity/contracts';
type PageInput = ReturnType<typeof sessionRequest.parse>['page'];
type Grant = ReturnType<typeof controlGrant.parse>;
export interface Membership { gameId: string; playerId: string; nickname: string; status: 'admitted' | 'removed' }
export interface Session { readonly id: string; readonly kind: 'browser' | 'host' }
export interface Page { readonly tabId: string; readonly requestPrefix: string; transportId: string | null }
interface PageRecord extends Page { input: PageInput; used: boolean; inFlight: boolean }
interface RecordState { session: Session; expiresAt: number; pages: Map<string, PageRecord>; control: { gameId: string; tabId: string; grant: Grant } | null }
export class SessionError extends Error {
  constructor(readonly code: 'UNAUTHORIZED' | 'SESSION_CAPACITY' | 'PAGE_CAPACITY' | 'WRONG_GAME' | 'REMOVED' | 'TAB_SUPERSEDED' | 'CONTROL_CONFIRMATION_REQUIRED' | 'INVALID_PAYLOAD') { super(code); }
}
export const sessionDefaults = { waitingLimit: 256, waitingTtlMs: 600_000, credentialTtlMs: 86_400_000, pageLimit: 8 } as const;
export interface SessionOptions {
  serverInstanceId: string; now: () => number; membership: (sessionId: string) => Membership | null;
  onRetirePage?: (session: Session, tabId: string) => void;
  waitingLimit?: number; waitingTtlMs?: number; credentialTtlMs?: number; pageLimit?: number;
}
const secret = () => randomBytes(32).toString('base64url');
function sameSecret(a: string, b: string): boolean { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
/** Cookie identities and page/control leases. Caller authenticates host authority separately. */
export class SessionService {
  #credentials = new Map<string, RecordState>(); #records = new Map<string, RecordState>(); #owner: RecordState;
  readonly options: Required<Omit<SessionOptions, 'onRetirePage'>> & Pick<SessionOptions, 'onRetirePage'>;
  constructor(options: SessionOptions) { this.options = { ...sessionDefaults, ...options }; this.#owner = this.#record('host', 'owner'); }
  #record(kind: Session['kind'], id: string = randomUUID()): RecordState {
    const record: RecordState = { session: Object.freeze({ id, kind }), expiresAt: this.options.now() + this.options.credentialTtlMs, pages: new Map(), control: null };
    this.#records.set(id, record); return record;
  }
  #get(session: Session): RecordState { const record = this.#records.get(session.id); if (!record || record.session !== session) throw new SessionError('UNAUTHORIZED'); return record; }
  #drop(record: RecordState): void { for (const page of record.pages.values()) this.options.onRetirePage?.(record.session, page.tabId); record.pages.clear(); record.control = null; this.#records.delete(record.session.id); }
  #sweep(): void { const now = this.options.now(); for (const [credential, record] of this.#credentials) { if (now >= record.expiresAt) { this.#credentials.delete(credential); this.#drop(record); } } }
  #touch(record: RecordState): void { const member = this.options.membership(record.session.id); record.expiresAt = this.options.now() + (member || record.session.kind === 'host' ? this.options.credentialTtlMs : this.options.waitingTtlMs); }
  resolve(credential: string | undefined): Session | null { this.#sweep(); const record = credential ? this.#credentials.get(credential) : undefined; if (!record) return null; this.#touch(record); return record.session; }
  createGuest(): { session: Session; credential: string } {
    this.#sweep(); const waiting = [...this.#credentials.values()].filter(record => !this.options.membership(record.session.id)).length;
    if (waiting >= this.options.waitingLimit) throw new SessionError('SESSION_CAPACITY');
    const credential = secret(); const record = this.#record('browser'); this.#touch(record); this.#credentials.set(credential, record); return { session: record.session, credential };
  }
  host(): Session { this.#touch(this.#owner); return this.#owner.session; }
  #member(session: Session, gameId: string): Membership {
    this.#get(session); const member = this.options.membership(session.id);
    if (!member || member.gameId !== gameId) throw new SessionError('WRONG_GAME'); if (member.status === 'removed') throw new SessionError('REMOVED'); return member;
  }
  #proof(record: RecordState, input: PageInput): boolean {
    const current = record.control; if (!current || input.kind !== 'continuation') return false;
    const proof = input.record; return proof.serverInstanceId === this.options.serverInstanceId && proof.gameId === current.gameId && proof.previousTabId === current.tabId && sameSecret(proof.continuationToken, current.grant.continuation.continuationToken);
  }
  bootstrap(session: Session, input: PageInput, context: { gameId: string | null; lastGameCommit: SessionResponse['lastGameCommit'] }): SessionResponse {
    const record = this.#get(session); this.#touch(record);
    if (record.pages.size >= this.options.pageLimit) {
      const candidate = [...record.pages.values()].find(page => page.tabId !== record.control?.tabId && !page.inFlight && !page.transportId);
      if (!candidate) throw new SessionError('PAGE_CAPACITY'); record.pages.delete(candidate.tabId); this.options.onRetirePage?.(session, candidate.tabId);
    }
    const page: PageRecord = { tabId: randomUUID(), requestPrefix: randomUUID(), input: structuredClone(input), used: false, inFlight: false, transportId: null }; record.pages.set(page.tabId, page);
    const base = { protocolVersion: 2, serverInstanceId: this.options.serverInstanceId, tabId: page.tabId, requestPrefix: page.requestPrefix };
    if (session.kind === 'host') return sessionResponse.parse({ ...base, role: 'host', membership: null, resume: 'none', hostGameId: context.gameId, lastGameCommit: context.lastGameCommit });
    const membership = this.options.membership(session.id);
    if (!membership) return sessionResponse.parse({ ...base, role: 'guest', membership: null, resume: 'none', hostGameId: null, lastGameCommit: null });
    const resume = membership.status === 'removed' ? 'none' : input.kind === 'fresh' ? 'fresh' : this.#proof(record, input) ? 'continuation' : 'confirmation-required';
    return sessionResponse.parse({ ...base, role: 'player', membership, resume, hostGameId: null, lastGameCommit: null });
  }
  page(session: Session, tabId: string, requestId?: string): Page {
    const page = this.#get(session).pages.get(tabId); if (!page) throw new SessionError('UNAUTHORIZED');
    if (requestId !== undefined) { const suffix = requestId.slice(page.requestPrefix.length + 1); if (!requestId.startsWith(page.requestPrefix + '.') || !/^[1-9][0-9]*$/.test(suffix) || !Number.isSafeInteger(Number(suffix))) throw new SessionError('INVALID_PAYLOAD'); }
    return { tabId: page.tabId, requestPrefix: page.requestPrefix, transportId: page.transportId };
  }
  currentControl(session: Session): { tabId: string; generation: number } | null {
    const record = this.#get(session); const member = this.options.membership(session.id);
    if (!member || member.status === 'removed' || member.gameId !== record.control?.gameId) return null;
    return { tabId: record.control.tabId, generation: record.control.grant.controlGeneration };
  }
  assertController(session: Session, tabId: string, gameId: string, generation?: number): void {
    this.#member(session, gameId); this.page(session, tabId); const control = this.#get(session).control;
    if (!control || control.gameId !== gameId || control.tabId !== tabId || (generation !== undefined && generation !== control.grant.controlGeneration)) throw new SessionError('TAB_SUPERSEDED');
  }
  control(session: Session, tabId: string, gameId: string, mode: 'join' | 'bootstrap' | 'loaded' | 'claim'): { control: Grant; supersededTabId?: string } {
    this.#member(session, gameId); this.#touch(this.#get(session)); this.page(session, tabId); const record = this.#get(session); const page = record.pages.get(tabId)!;
    if (record.control && record.control.gameId !== gameId) record.control = null; const current = record.control;
    if (current?.tabId === tabId) return { control: structuredClone(current.grant) };
    if (mode !== 'claim') { if ((page.used && !(mode === 'join' && !current)) || mode === 'loaded') throw new SessionError('TAB_SUPERSEDED'); if (!(mode === 'join' && !current) && page.input.kind !== 'fresh' && !this.#proof(record, page.input)) throw new SessionError('CONTROL_CONFIRMATION_REQUIRED'); }
    const grant: Grant = { controlGeneration: (current?.grant.controlGeneration ?? 0) + 1, continuation: { serverInstanceId: this.options.serverInstanceId, gameId, previousTabId: tabId, continuationToken: secret() } };
    record.control = { gameId, tabId, grant }; page.used = true; return { control: structuredClone(grant), ...(current ? { supersededTabId: current.tabId } : {}) };
  }
  attachTransport(session: Session, tabId: string, transportId: string): string | null { this.page(session, tabId); const page = this.#get(session).pages.get(tabId)!; const old = page.transportId; page.transportId = transportId; return old; }
  detachTransport(session: Session, tabId: string, transportId: string): boolean { const page = this.#records.get(session.id)?.pages.get(tabId); if (!page || page.transportId !== transportId) return false; page.transportId = null; return true; }
  setInFlight(session: Session, tabId: string, active: boolean): void { this.page(session, tabId); this.#get(session).pages.get(tabId)!.inFlight = active; }
  invalidateGame(gameId: string): void {
    for (const record of this.#records.values()) if (record.control?.gameId === gameId) record.control = null;
    // Former memberships become waiting sessions after replacement; bound their idle life.
    const waiting = [...this.#credentials].filter(([, record]) => !this.options.membership(record.session.id));
    for (const [, record] of waiting) record.expiresAt = Math.min(record.expiresAt, this.options.now() + this.options.waitingTtlMs);
    for (const [credential, record] of waiting.slice(0, Math.max(0, waiting.length - this.options.waitingLimit))) {
      this.#credentials.delete(credential); this.#drop(record);
    }
  }
  removeMembership(sessionId: string): void { const record = this.#records.get(sessionId); if (!record) return; record.control = null; for (const page of record.pages.values()) this.options.onRetirePage?.(record.session, page.tabId); record.pages.clear(); }
  /** Private aggregate instrumentation; never returned through a public route. */
  stats() {
    const records = [...this.#records.values()];
    return { records: records.length, credentials: this.#credentials.size,
      waiting: [...this.#credentials.values()].filter(record => !this.options.membership(record.session.id)).length,
      pages: records.reduce((sum, record) => sum + record.pages.size, 0),
      maxPagesPerIdentity: records.reduce((max, record) => Math.max(max, record.pages.size), 0) };
  }
  clear(): void { for (const record of this.#records.values()) this.#drop(record); this.#credentials.clear(); }
}
