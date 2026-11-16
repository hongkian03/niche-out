import { describe, expect, it } from 'vitest';
import { RequestLedger, ledgerDefaults, type LedgerContext } from '../../apps/server/src/game/ledger.js';
function harness() {
  let now = 0; const ledger = new RequestLedger({ now: () => now, rejectedLimit: 2, rejectedTtlMs: 10 });
  const context = (sequence = 1, extra: Partial<LedgerContext> = {}): LedgerContext => ({ scope: 'player', pageId: 'page', requestPrefix: 'prefix', requestId: 'prefix.' + sequence, fingerprint: 'body-' + sequence, gameId: 'game', ...extra });
  return { ledger, context, setNow: (time: number) => { now = time; } };
}
describe('production request ledger', () => {
  it('uses bounded production defaults and recovers identical successful replies without running twice', () => {
    expect(ledgerDefaults).toEqual({ rejectedLimit: 256, rejectedTtlMs: 120000 }); const h = harness(); let calls = 0;
    const context = h.context(1, { pinKey: 'answer:round' }); const first = h.ledger.run(context, () => ({ outcome: 'ACCEPTED', calls: ++calls }));
    h.setNow(100); const retry = h.ledger.run(context, () => ({ outcome: 'ACCEPTED', calls: ++calls })); expect(first).toEqual(retry); expect(calls).toBe(1);
  });
  it('detects changed semantic content under one request ID even on a cache hit', () => {
    const h = harness(); h.ledger.run(h.context(), () => ({ outcome: 'JOINED' }));
    expect(() => h.ledger.run(h.context(1, { fingerprint: 'different' }), () => ({}))).toThrow('REQUEST_ID_REUSE');
    expect(() => h.ledger.fence(h.context(1, { fingerprint: 'different' }))).toThrow('REQUEST_ID_REUSE');
  });
  it('bounds rejected entries and uses highwater to prevent evicted/expired requests executing', () => {
    const h = harness(); let calls = 0;
    for (let i = 1; i <= 3; i++) h.ledger.run(h.context(i), () => ({ code: 'RATE_LIMITED', calls: ++calls }));
    expect(() => h.ledger.run(h.context(1), () => ({ calls: ++calls }))).toThrow('STALE_REQUEST');
    h.setNow(10); expect(() => h.ledger.run(h.context(3), () => ({ calls: ++calls }))).toThrow('STALE_REQUEST'); expect(calls).toBe(3);
  });
  it('pins only first successful semantic operation, never unbounded retries with fresh IDs', () => {
    const h = harness(); const c = (n: number) => h.context(n, { pinKey: 'join' });
    h.ledger.run(c(1), () => ({ code: 'GAME_FULL' })); h.ledger.run(c(2), () => ({ outcome: 'JOINED' }));
    for (let i = 3; i < 20; i++) h.ledger.run(c(i), () => ({ outcome: 'JOINED' })); h.setNow(100);
    expect(h.ledger.inspect(c(2))).toEqual({ outcome: 'JOINED' }); expect(h.ledger.inspect(c(19))).toBeUndefined();
    expect(() => h.ledger.run(c(19), () => ({}))).toThrow('STALE_REQUEST');
  });
  it('does not pin a normal answer rejection and permits a new edited request', () => {
    const h = harness(); h.ledger.run(h.context(1, { pinKey: 'answer' }), () => ({ outcome: 'REJECTED' }));
    h.ledger.run(h.context(2, { pinKey: 'answer' }), () => ({ outcome: 'ACCEPTED' })); h.setNow(20);
    expect(h.ledger.inspect(h.context(1))).toBeUndefined(); expect(h.ledger.inspect(h.context(2))).toEqual({ outcome: 'ACCEPTED' });
  });
  it('fence-first prevents original execution and repeated resolution stays idempotent after eviction', () => {
    const h = harness(); const original = h.context(1, { pinKey: 'commit' }); expect(h.ledger.fence(original)).toBeUndefined(); expect(h.ledger.isFenced(original)).toBe(true);
    expect(() => h.ledger.run(original, () => ({ outcome: 'COMMITTED' }))).toThrow('OPERATION_CANCELLED');
    h.setNow(20); expect(h.ledger.fence(original)).toBeUndefined(); expect(h.ledger.isFenced(original)).toBe(true);
    expect(() => h.ledger.run(original, () => ({ outcome: 'COMMITTED' }))).toThrow('OPERATION_CANCELLED');
  });
  it('converts a recorded rejection to a durable fence so repeated resolution remains NOT_APPLIED', () => {
    const h = harness(); const original = h.context(1, { pinKey: 'commit' });
    h.ledger.run(original, () => ({ code: 'CANDIDATE_EXPIRED' }));
    expect(h.ledger.fence(original)).toBeUndefined(); expect(h.ledger.isFenced(original)).toBe(true);
    h.setNow(20); expect(h.ledger.isFenced(original)).toBe(true);
    expect(() => h.ledger.run(original, () => ({ outcome: 'COMMITTED' }))).toThrow('OPERATION_CANCELLED');
  });
  it('original-first resolution recovers the recorded result and never fences an applied operation', () => {
    const h = harness(); const original = h.context(1, { pinKey: 'start' }); h.ledger.run(original, () => ({ outcome: 'STARTED' }));
    expect(h.ledger.fence(original)).toEqual({ outcome: 'STARTED' }); expect(h.ledger.isFenced(original)).toBe(false);
  });
  it('replacement clears obsolete replies but retains replay protection and pins the new commit after its mutation', () => {
    const h = harness(); h.ledger.run(h.context(1, { pinKey: 'join' }), () => ({ outcome: 'JOINED' }));
    h.ledger.run(h.context(2, { pinKey: 'commit' }), () => { h.ledger.replaceGame(); return { outcome: 'COMMITTED' }; });
    expect(h.ledger.inspect(h.context(1))).toBeUndefined(); expect(() => h.ledger.run(h.context(1), () => ({}))).toThrow('STALE_REQUEST');
    expect(h.ledger.inspect(h.context(2))).toEqual({ outcome: 'COMMITTED' });
  });
  it('retired pages lose transient metadata while pinned owner outcomes survive until replacement', () => {
    const h = harness(); h.ledger.run(h.context(1, { pinKey: 'commit' }), () => ({ outcome: 'COMMITTED' }));
    h.ledger.run(h.context(2), () => ({ code: 'WRONG_PHASE' })); h.ledger.retirePage('player', 'page');
    expect(h.ledger.inspect(h.context(1))).toEqual({ outcome: 'COMMITTED' }); expect(h.ledger.inspect(h.context(2))).toBeUndefined();
    h.ledger.replaceGame(); expect(h.ledger.inspect(h.context(1))).toBeUndefined();
  });
  it('defensively copies cached reply data and does not let read queries consume sequence order', () => {
    const h = harness(); const result = h.ledger.run(h.context(1), () => ({ nested: { value: 1 } })); result.nested.value = 2;
    const cached = h.ledger.inspect<{ nested: { value: number } }>(h.context(1))!; expect(cached.nested.value).toBe(1); cached.nested.value = 3;
    expect(h.ledger.inspect(h.context(100))).toBeUndefined(); expect(h.ledger.run(h.context(2), () => ({ outcome: 'ok' }))).toEqual({ outcome: 'ok' });
    expect(h.ledger.inspect(h.context(1))).toEqual({ nested: { value: 1 } });
  });
  it('rejects foreign/invalid prefixes and prevents retrying an unexpected thrown mutation', () => {
    const h = harness(); expect(() => h.ledger.run(h.context(1, { requestId: 'other.1' }), () => ({}))).toThrow('INVALID_PAYLOAD');
    expect(() => h.ledger.run(h.context(1), () => { throw new Error('unexpected'); })).toThrow('unexpected');
    expect(() => h.ledger.run(h.context(1), () => ({}))).toThrow('STALE_REQUEST');
  });
});
