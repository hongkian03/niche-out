/** Request identity is checked only after current session/role/control authorization. */
export interface LedgerContext {
  scope: string; pageId: string; requestPrefix: string; requestId: string; fingerprint: string;
  gameId?: string | null; pinKey?: string; rejectedLimit?: number;
}
export class LedgerError extends Error {
  constructor(readonly code: 'INVALID_PAYLOAD' | 'REQUEST_ID_REUSE' | 'STALE_REQUEST' | 'OPERATION_CANCELLED') { super(code); }
}
interface Entry { fingerprint: string; result?: unknown; cancelled: boolean; expiresAt: number; pageId: string; gameId?: string | null }
interface PageState { prefix: string; highWater: number; fenceHighWater: number }
interface ScopeState { pages: Map<string, PageState>; transient: Map<string, Entry>; pinned: Map<string, Entry>; pins: Set<string> }
export const ledgerDefaults = { rejectedLimit: 256, rejectedTtlMs: 120_000 } as const;
export class RequestLedger {
  #scopes = new Map<string, ScopeState>();
  readonly options: { now: () => number; rejectedLimit: number; rejectedTtlMs: number };
  constructor(options: { now: () => number; rejectedLimit?: number; rejectedTtlMs?: number }) { this.options = { ...ledgerDefaults, ...options }; }
  #scope(key: string): ScopeState {
    let scope = this.#scopes.get(key); if (!scope) { scope = { pages: new Map(), transient: new Map(), pinned: new Map(), pins: new Set() }; this.#scopes.set(key, scope); } return scope;
  }
  #key(context: LedgerContext): string { return context.pageId + ':' + context.requestId; }
  #sequence(context: LedgerContext): number {
    const suffix = context.requestId.slice(context.requestPrefix.length + 1);
    if (!context.requestId.startsWith(context.requestPrefix + '.') || !/^[1-9][0-9]*$/.test(suffix) || !Number.isSafeInteger(Number(suffix))) throw new LedgerError('INVALID_PAYLOAD');
    return Number(suffix);
  }
  #page(scope: ScopeState, context: LedgerContext): PageState {
    let page = scope.pages.get(context.pageId);
    if (!page) { page = { prefix: context.requestPrefix, highWater: 0, fenceHighWater: 0 }; scope.pages.set(context.pageId, page); }
    if (page.prefix !== context.requestPrefix) throw new LedgerError('INVALID_PAYLOAD'); return page;
  }
  #prune(scope: ScopeState): void { for (const [key, entry] of scope.transient) if (this.options.now() >= entry.expiresAt) scope.transient.delete(key); }
  #entry(scope: ScopeState, context: LedgerContext): Entry | undefined {
    this.#sequence(context); this.#prune(scope); const entry = scope.pinned.get(this.#key(context)) ?? scope.transient.get(this.#key(context));
    if (entry && entry.fingerprint !== context.fingerprint) throw new LedgerError('REQUEST_ID_REUSE'); return entry;
  }
  inspect<T = unknown>(context: LedgerContext): T | undefined {
    const scope = this.#scopes.get(context.scope); if (!scope) return undefined;
    const entry = this.#entry(scope, context); if (entry?.cancelled) return undefined;
    return entry ? structuredClone(entry.result) as T : undefined;
  }
  isFenced(context: LedgerContext): boolean {
    const scope = this.#scopes.get(context.scope); if (!scope) return false;
    const entry = this.#entry(scope, context); if (entry) return entry.cancelled;
    const page = scope.pages.get(context.pageId);
    return !!page && this.#sequence(context) <= page.fenceHighWater;
  }
  #store(scope: ScopeState, context: LedgerContext, entry: Entry, pin = false): void {
    const key = this.#key(context); const pinKey = (context.gameId ?? '') + ':' + context.pinKey;
    if (pin && context.pinKey && !scope.pins.has(pinKey)) { scope.pins.add(pinKey); scope.pinned.set(key, entry); return; }
    scope.transient.set(key, entry);
    const limit = context.rejectedLimit ?? this.options.rejectedLimit;
    while (scope.transient.size > limit) scope.transient.delete(scope.transient.keys().next().value!);
  }
  run<T>(context: LedgerContext, operation: () => T): T {
    const scope = this.#scope(context.scope); const sequence = this.#sequence(context); const page = this.#page(scope, context); const cached = this.#entry(scope, context);
    if (cached) { if (cached.cancelled) throw new LedgerError('OPERATION_CANCELLED'); return structuredClone(cached.result) as T; }
    if (sequence <= page.fenceHighWater) throw new LedgerError('OPERATION_CANCELLED');
    if (sequence <= page.highWater) throw new LedgerError('STALE_REQUEST');
    // Dispatchers turn domain errors into reply values. A thrown unexpected exception
    // still fences this sequence: a partially completed callback must never be retried.
    page.highWater = sequence;
    const result = operation();
    const success = typeof result === 'object' && result !== null && !('code' in result) && !('error' in result) && (!('outcome' in result) || result.outcome !== 'REJECTED');
    this.#store(scope, context, { fingerprint: context.fingerprint, result: structuredClone(result), cancelled: false, expiresAt: this.options.now() + this.options.rejectedTtlMs, pageId: context.pageId, gameId: context.gameId }, success);
    return result;
  }
  /** Return a previously completed outcome, or atomically prevent the original execution. */
  fence<T = unknown>(context: LedgerContext): T | undefined {
    const scope = this.#scope(context.scope); const sequence = this.#sequence(context); const page = this.#page(scope, context); const cached = this.#entry(scope, context);
    if (cached && !cached.cancelled && typeof cached.result === 'object' && cached.result !== null && !('code' in cached.result) && !('error' in cached.result)) return structuredClone(cached.result) as T;
    if (cached?.cancelled || sequence <= page.fenceHighWater) return undefined;
    page.highWater = Math.max(page.highWater, sequence); page.fenceHighWater = Math.max(page.fenceHighWater, sequence);
    this.#store(scope, context, { fingerprint: context.fingerprint, cancelled: true, expiresAt: this.options.now() + this.options.rejectedTtlMs, pageId: context.pageId, gameId: context.gameId }); return undefined;
  }
  /** Session registry rejects retired IDs before dispatch. Current-game pinned outcomes survive for owner reconciliation. */
  retirePage(scopeId: string, pageId: string): void {
    const scope = this.#scopes.get(scopeId); if (!scope) return;
    scope.pages.delete(pageId); for (const [key, entry] of scope.transient) if (entry.pageId === pageId) scope.transient.delete(key);
    if (!scope.pages.size && !scope.pinned.size) this.#scopes.delete(scopeId);
  }
  /** Preserve sequence fences for still-registered pages; obsolete game results cannot be replayed. */
  replaceGame(): void { for (const [id, scope] of this.#scopes) { scope.pinned.clear(); scope.pins.clear(); scope.transient.clear(); if (!scope.pages.size) this.#scopes.delete(id); } }
  /** Private aggregate instrumentation; no request IDs, bodies or identity data. */
  stats() {
    const scopes = [...this.#scopes.values()];
    return { scopes: scopes.length, pages: scopes.reduce((sum, scope) => sum + scope.pages.size, 0),
      transient: scopes.reduce((sum, scope) => sum + scope.transient.size, 0),
      maxTransientPerScope: scopes.reduce((max, scope) => Math.max(max, scope.transient.size), 0),
      pinned: scopes.reduce((sum, scope) => sum + scope.pinned.size, 0) };
  }
  clear(): void { this.#scopes.clear(); }
}
