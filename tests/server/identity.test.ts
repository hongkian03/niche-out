import { describe, it, expect } from 'vitest';
import { SessionService, sessionDefaults, type Membership, type SessionOptions } from '../../apps/server/src/game/sessions.js';
import { OwnerAuthority } from '../../apps/server/src/hosting/owner.js';
import { sessionResponse, controlGrant } from '../../packages/contracts/src/index.js';
function setup(options: Partial<SessionOptions> = {}) {
  let now = 0; const members = new Map<string, Membership>(); const retired: string[] = [];
  const service = new SessionService({ serverInstanceId: 'instance', now: () => now, membership: id => members.get(id) ?? null, onRetirePage: (_s, id) => retired.push(id), ...options });
  const browser = service.createGuest();
  const context = { gameId: null, lastGameCommit: null };
  const bootstrap = (input: Parameters<SessionService['bootstrap']>[1] = { kind: 'fresh' }) => service.bootstrap(browser.session, input, context);
  const admit = () => members.set(browser.session.id, { gameId: 'game', playerId: 'player', nickname: 'Ada', status: 'admitted' });
  return { service, browser, members, retired, bootstrap, admit, setNow: (value: number) => { now = value; } };
}
describe('production session discovery and limits', () => {
  it('uses production capacity/expiry defaults and unpredictable cookie identities', () => {
    expect(sessionDefaults).toEqual({ waitingLimit: 256, waitingTtlMs: 600000, credentialTtlMs: 86400000, pageLimit: 8 });
    const h = setup(); expect(h.browser.credential).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(h.service.resolve('invented')).toBeNull();
    const discovery = h.bootstrap(); expect(sessionResponse.safeParse(discovery).success).toBe(true);
    expect(discovery).toMatchObject({ role: 'guest', membership: null, hostGameId: null, resume: 'none' });
    expect(JSON.stringify(discovery)).not.toContain(h.browser.credential);
  });
  it('discovers only own current membership, removed status and no silent replacement admission', () => {
    const h = setup(); h.admit(); expect(h.bootstrap()).toMatchObject({ role: 'player', membership: { playerId: 'player' }, resume: 'fresh' });
    h.members.get(h.browser.session.id)!.status = 'removed'; expect(h.bootstrap()).toMatchObject({ membership: { status: 'removed' }, resume: 'none' });
    h.members.clear(); h.service.invalidateGame('game'); expect(h.bootstrap()).toMatchObject({ role: 'guest', membership: null });
  });
  it('keeps host logical pages stable across authority recovery and exposes commit context only to host', () => {
    const h = setup(); const host = h.service.host();
    const commit = { requestId: 'req.1', candidateId: 'candidate', gameId: 'game', setupGeneration: 1, revision: 1 };
    const view = h.service.bootstrap(host, { kind: 'fresh' }, { gameId: 'game', lastGameCommit: commit });
    expect(view).toMatchObject({ role: 'host', hostGameId: 'game', lastGameCommit: commit }); expect(h.service.host()).toBe(host);
    expect(h.service.page(h.service.host(), view.tabId, view.requestPrefix + '.1').tabId).toBe(view.tabId);
    expect(h.bootstrap()).toMatchObject({ lastGameCommit: null });
  });
  it('bounds shared-NAT guests independently of IP and never evicts an admitted player or host', () => {
    const h = setup({ waitingLimit: 2, waitingTtlMs: 10, credentialTtlMs: 100 }); h.admit(); h.bootstrap();
    const a = h.service.createGuest(); const b = h.service.createGuest();
    expect(() => h.service.createGuest()).toThrow('SESSION_CAPACITY');
    h.setNow(10); expect(h.service.resolve(a.credential)).toBeNull(); expect(h.service.resolve(b.credential)).toBeNull();
    expect(h.service.resolve(h.browser.credential)).toBe(h.browser.session); expect(h.service.host().kind).toBe('host');
    expect(h.service.createGuest()).toBeTruthy();
  });
  it('uses rolling credential expiry for admitted sessions and drops stale page identities', () => {
    const h = setup({ waitingTtlMs: 10, credentialTtlMs: 100 }); h.admit(); const page = h.bootstrap();
    h.setNow(99); expect(h.service.resolve(h.browser.credential)).toBe(h.browser.session);
    h.setNow(198); expect(h.service.resolve(h.browser.credential)).toBe(h.browser.session);
    h.setNow(298); expect(h.service.resolve(h.browser.credential)).toBeNull(); expect(h.retired).toContain(page.tabId);
    expect(() => h.service.page(h.browser.session, page.tabId)).toThrow('UNAUTHORIZED');
  });
  it('retires only inactive noncontrolling pages and protects live/inflight pages', () => {
    const h = setup({ pageLimit: 2 }); const first = h.bootstrap(); const second = h.bootstrap();
    h.service.attachTransport(h.browser.session, first.tabId, 'socket'); h.service.setInFlight(h.browser.session, second.tabId, true);
    expect(() => h.bootstrap()).toThrow('PAGE_CAPACITY'); h.service.setInFlight(h.browser.session, second.tabId, false);
    const third = h.bootstrap(); expect(h.retired).toEqual([second.tabId]); expect(third.tabId).not.toBe(second.tabId);
    expect(() => h.service.page(h.browser.session, second.tabId)).toThrow('UNAUTHORIZED');
  });
  it('bounds the waiting pool again when replacement turns old memberships into guests', () => {
    const h = setup({ waitingLimit: 2 }); h.admit(); const oldPage = h.bootstrap();
    const second = h.service.createGuest(); h.members.set(second.session.id, { gameId: 'game', playerId: 'two', nickname: 'Bo', status: 'removed' });
    const waitingA = h.service.createGuest(); const waitingB = h.service.createGuest();
    h.members.clear(); h.service.invalidateGame('game');
    expect(h.service.resolve(h.browser.credential)).toBeNull(); expect(h.service.resolve(second.credential)).toBeNull();
    expect(h.service.resolve(waitingA.credential)).toBe(waitingA.session); expect(h.service.resolve(waitingB.credential)).toBe(waitingB.session);
    expect(h.retired).toContain(oldPage.tabId); expect(() => h.service.createGuest()).toThrow('SESSION_CAPACITY');
  });
  it('never retires the controlling page even while its transport is disconnected', () => {
    const h = setup({ pageLimit: 2 }); const controller = h.bootstrap(); h.admit(); h.service.control(h.browser.session, controller.tabId, 'game', 'join');
    const old = h.bootstrap(); h.bootstrap(); expect(h.retired).toEqual([old.tabId]);
    expect(h.service.currentControl(h.browser.session)?.tabId).toBe(controller.tabId);
    h.service.assertController(h.browser.session, controller.tabId, 'game', 1);
  });
  it('binds pages and prefixes to their browser and replaces at most one transport', () => {
    const h = setup(); const page = h.bootstrap(); const other = h.service.createGuest();
    expect(() => h.service.page(other.session, page.tabId)).toThrow('UNAUTHORIZED');
    expect(() => h.service.page(h.browser.session, page.tabId, 'forged.1')).toThrow('INVALID_PAYLOAD');
    expect(h.service.attachTransport(h.browser.session, page.tabId, 'a')).toBeNull(); expect(h.service.attachTransport(h.browser.session, page.tabId, 'b')).toBe('a');
    expect(h.service.detachTransport(h.browser.session, page.tabId, 'a')).toBe(false); expect(h.service.page(h.browser.session, page.tabId).transportId).toBe('b');
    expect(h.service.detachTransport(h.browser.session, page.tabId, 'b')).toBe(true);
  });
});
describe('production controller leases', () => {
  it('first admission creates a grant, loaded resume preserves generation and normal new tab transfers once', () => {
    const h = setup(); const a = h.bootstrap(); h.admit();
    const first = h.service.control(h.browser.session, a.tabId, 'game', 'join'); expect(controlGrant.safeParse(first.control).success).toBe(true);
    expect(first.control.controlGeneration).toBe(1); expect(h.service.control(h.browser.session, a.tabId, 'game', 'loaded')).toEqual(first);
    const b = h.bootstrap(); const next = h.service.control(h.browser.session, b.tabId, 'game', 'bootstrap');
    expect(next).toMatchObject({ control: { controlGeneration: 2 }, supersededTabId: a.tabId });
    expect(() => h.service.control(h.browser.session, a.tabId, 'game', 'loaded')).toThrow('TAB_SUPERSEDED');
    expect(() => h.service.assertController(h.browser.session, a.tabId, 'game', 1)).toThrow('TAB_SUPERSEDED');
  });
  it('classifies copied proofs without consumption, then only one atomic resume can consume', () => {
    const h = setup(); const a = h.bootstrap(); h.admit(); const grant = h.service.control(h.browser.session, a.tabId, 'game', 'join').control;
    const input = { kind: 'continuation' as const, record: grant.continuation }; const b = h.bootstrap(input); const c = h.bootstrap(input);
    expect(b.resume).toBe('continuation'); expect(c.resume).toBe('continuation'); expect(h.service.currentControl(h.browser.session)?.tabId).toBe(a.tabId);
    const resumed = h.service.control(h.browser.session, b.tabId, 'game', 'bootstrap'); expect(resumed.control.controlGeneration).toBe(2);
    expect(() => h.service.control(h.browser.session, c.tabId, 'game', 'bootstrap')).toThrow('CONTROL_CONFIRMATION_REQUIRED');
    expect(h.service.control(h.browser.session, b.tabId, 'game', 'loaded').control).toEqual(resumed.control);
    const explicit = h.service.control(h.browser.session, c.tabId, 'game', 'claim'); expect(explicit.control.controlGeneration).toBe(3);
    expect(() => h.service.control(h.browser.session, b.tabId, 'game', 'bootstrap')).toThrow('TAB_SUPERSEDED');
  });
  it.each(['ambiguous', 'unavailable'] as const)('requires explicit takeover for %s input', kind => {
    const h = setup(); const a = h.bootstrap(); h.admit(); h.service.control(h.browser.session, a.tabId, 'game', 'join'); const b = h.bootstrap({ kind });
    expect(b.resume).toBe('confirmation-required'); expect(() => h.service.control(h.browser.session, b.tabId, 'game', 'bootstrap')).toThrow('CONTROL_CONFIRMATION_REQUIRED');
    expect(h.service.control(h.browser.session, b.tabId, 'game', 'claim').control.controlGeneration).toBe(2);
  });
  it('rejects mismatched proof context and does not leak continuation or answer text through discovery', () => {
    const h = setup(); const a = h.bootstrap(); h.admit(); const grant = h.service.control(h.browser.session, a.tabId, 'game', 'join').control;
    for (const change of [{ gameId: 'other' }, { serverInstanceId: 'old' }, { previousTabId: 'another' }]) {
      const page = h.bootstrap({ kind: 'continuation', record: { ...grant.continuation, ...change } }); expect(page.resume).toBe('confirmation-required');
    }
    expect(JSON.stringify(h.bootstrap())).not.toContain(grant.continuation.continuationToken);
  });
  it('allows an explicitly admitted replacement membership to establish control on its same loaded page', () => {
    const h = setup(); const page = h.bootstrap(); h.admit(); h.service.control(h.browser.session, page.tabId, 'game', 'join');
    h.members.clear(); h.service.invalidateGame('game');
    h.members.set(h.browser.session.id, { gameId: 'replacement', playerId: 'new', nickname: 'Ada', status: 'admitted' });
    expect(h.service.control(h.browser.session, page.tabId, 'replacement', 'join').control.controlGeneration).toBe(1);
  });
  it('removal and replacement invalidate proofs, while explicit admission to a new game can reuse a loaded page', () => {
    const h = setup(); const a = h.bootstrap(); h.admit(); const first = h.service.control(h.browser.session, a.tabId, 'game', 'join');
    h.members.get(h.browser.session.id)!.status = 'removed'; h.service.removeMembership(h.browser.session.id);
    expect(() => h.service.control(h.browser.session, a.tabId, 'game', 'claim')).toThrow('REMOVED'); expect(h.service.currentControl(h.browser.session)).toBeNull();
    h.members.clear(); h.service.invalidateGame('game'); const page = h.bootstrap({ kind: 'continuation', record: first.control.continuation });
    h.members.set(h.browser.session.id, { gameId: 'new', playerId: 'new-player', nickname: 'Ada', status: 'admitted' });
    expect(h.service.control(h.browser.session, page.tabId, 'new', 'join').control.controlGeneration).toBe(1);
  });
});


describe('architecture 24-hour owner credential expiry', () => {
  const day = 86_400_000;
  function setupOwner() {
    let now = 0; const owner = new OwnerAuthority(() => now);
    const exchanged = owner.exchange(owner.mint(), false);
    if (!('credential' in exchanged)) throw new Error('Expected owner credential');
    return { owner, credential: exchanged.credential, setNow: (value: number) => { now = value; } };
  }
  it('refreshes the 24-hour window only after a valid credential is used', () => {
    const h = setupOwner(); h.setNow(day - 1); expect(h.owner.authorized(h.credential)).toBe(true);
    h.setNow(day * 2 - 2); expect(h.owner.authorized(h.credential)).toBe(true);
    h.setNow(day * 3 - 3); expect(h.owner.authorized(h.credential)).toBe(true);
  });
  it('expires at the exact idle boundary and invalid credentials cannot keep it alive', () => {
    const h = setupOwner(); h.setNow(day - 1); expect(h.owner.authorized('wrong-credential')).toBe(false);
    h.setNow(day); expect(h.owner.authorized(h.credential)).toBe(false);
    h.setNow(day + 1); expect(h.owner.authorized(h.credential)).toBe(false);
  });
  it('minting an unused link neither extends nor revokes the current credential', () => {
    const h = setupOwner(); h.setNow(day - 1); const token = h.owner.mint();
    h.setNow(day); expect(h.owner.authorized(h.credential)).toBe(false);
    const recovered = h.owner.exchange(token, false); expect(recovered).toHaveProperty('credential');
    if (!('credential' in recovered)) throw new Error('Expected recovery');
    expect(h.owner.authorized(recovered.credential)).toBe(true);
  });
  it('a refused role conversion preserves the unused token for local recovery', () => {
    const h = setupOwner(); h.setNow(day); const token = h.owner.mint();
    expect(h.owner.exchange(token, true)).toEqual({ error: 'HOST_PLAYER_CONFLICT' });
    const recovered = h.owner.exchange(token, false); expect(recovered).toHaveProperty('credential');
    expect(h.owner.authorized(h.credential)).toBe(false);
  });
});
