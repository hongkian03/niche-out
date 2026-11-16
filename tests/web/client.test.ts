import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeView, sessionResponse, type CompleteView, type SessionResponse } from '@rarity/contracts';
import { GameClient, type ClientSocket } from '../../apps/web/src/client.js';

const instance = 'instance', game = 'game', tab = 'tab', secret = 'A'.repeat(43);
const clock = 10_000;
const ownPlayer = { playerId: 'player', nickname: 'Diver' };
const hosting = { status: 'ready' as const, publicOrigin: 'https://game.example.com' };
const summary = { title: 'Seasons', promptCount: 1, tiers: [{ name: 'Rare', points: 100 }], settings: { readingSeconds: 3, answerSeconds: 25, resultsSeconds: 10 } };
const candidate = { serverInstanceId: instance, candidateId: 'candidate', expectedGameId: null, expectedSetupGeneration: 0, summary };
const base = { protocolVersion: 1, serverInstanceId: instance, revision: 1, phaseId: 'phase', serverNowMs: clock };
const inactive = { roundId: null, roundIndex: null, phaseDeadlineMs: null };
const grant = (generation = 1, page = tab) => ({ controlGeneration: generation, continuation: {
  serverInstanceId: instance, gameId: game, previousTabId: page, continuationToken: secret,
} });
function session(role: 'guest' | 'player' | 'host', additions: Record<string, unknown> = {}): SessionResponse {
  return sessionResponse.parse({ protocolVersion: 1, serverInstanceId: instance, tabId: tab, requestPrefix: 'request', role,
    hostGameId: null, lastGameCommit: null, membership: role === 'player' ? { ...ownPlayer, gameId: game, status: 'admitted' } : null,
    resume: role === 'player' ? 'continuation' : 'none', ...additions });
}
function live(additions: Record<string, unknown> = {}): CompleteView {
  return completeView.parse({ ...base, gameId: game, promptCount: 1, phase: 'Answering', viewRole: 'player',
    roundId: 'round', roundIndex: 0, prompt: 'Name a season.', phaseDeadlineMs: clock + 25000,
    readiness: { accepted: 0, eligible: 2 }, ownPlayer, ownAnswer: { locked: false, submittedText: null },
    controlGeneration: 1, publishedTotal: 0, publishedStandings: [], ...additions });
}
function setup(additions: Record<string, unknown> = {}): CompleteView {
  return completeView.parse({ ...base, ...inactive, gameId: null, promptCount: 0, phase: 'Setup', viewRole: 'host', hosting, setupGeneration: 0, ...additions });
}
function lobby(additions: Record<string, unknown> = {}): CompleteView {
  return completeView.parse({ ...base, ...inactive, revision: 2, phaseId: 'lobby', gameId: game, promptCount: 1,
    phase: 'Lobby', viewRole: 'host', hosting, setupGeneration: 1, packSummary: summary,
    invitation: { code: '001234', joinUrl: hosting.publicOrigin + '/join', qrPayload: hosting.publicOrigin + '/join?code=001234' },
    roster: [], canStart: false, canReplace: true, admissionHistoryFull: false, ...additions });
}
const publicResults = { groups: [{ canonicalText: 'Autumn', tierName: 'Rare', points: 100, count: 1 }], unused: null };
function results(additions: Record<string, unknown> = {}): CompleteView {
  return completeView.parse({ ...base, revision: 3, phaseId: 'results', gameId: game, promptCount: 1, phase: 'Results', viewRole: 'player',
    roundId: 'round', roundIndex: 0, prompt: 'Name a season.', phaseDeadlineMs: clock + 35000, ownPlayer,
    ownResult: { outcome: 'accepted', submittedText: 'Fall', canonicalText: 'Autumn', tierName: 'Rare', points: 100 },
    results: publicResults, standings: [{ ...ownPlayer, rank: 1, publishedTotal: 100, roundPoints: 100 }], ...additions });
}
function finished(additions: Record<string, unknown> = {}): CompleteView {
  return completeView.parse({ ...base, ...inactive, revision: 4, phaseId: 'finished', gameId: game, promptCount: 1,
    phase: 'Finished', viewRole: 'host', hosting, setupGeneration: 1,
    standings: [{ ...ownPlayer, rank: 1, publishedTotal: 100 }], winnerIds: ['player'], requestedDetail: null,
    rounds: [{ roundId: 'round', roundIndex: 0, prompt: 'Name a season.' }], ...additions });
}
type Ack = (error: Error | null, result?: unknown) => void;
class FakeSocket implements ClientSocket {
  connected = false;
  connectCount = 0;
  listeners = new Map<string, ((...args: any[]) => void)[]>();
  calls: { name: string; body: any }[] = [];
  handler: (name: string, body: any, ack: Ack) => void = () => {};
  on(event: string, listener: (...args: any[]) => void) { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); }
  fire(event: string, ...args: unknown[]) { for (const listener of this.listeners.get(event) ?? []) listener(...args); }
  connect() { this.connectCount++; this.connected = true; this.fire('connect'); }
  disconnect() { const connected = this.connected; this.connected = false; if (connected) this.fire('disconnect', 'io client disconnect'); }
  removeAllListeners() { this.listeners.clear(); }
  timeout() { return { emit: (name: string, body: unknown, ack: Ack) => { this.calls.push({ name, body }); this.handler(name, body, ack); } }; }
  lose(reason = 'transport close') { this.connected = false; this.fire('disconnect', reason); }
}
const clients: GameClient[] = [];
afterEach(() => { clients.splice(0).forEach(client => client.dispose()); vi.useRealTimers(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
async function flush() { for (let i = 0; i < 50; i++) await Promise.resolve(); }
function harness(role: 'host' | 'player' | 'guest' = 'player', saved = new Map<string, string>(), now = () => clock) {
  const socket = new FakeSocket();
  const h = {
    socket, saved, discovery: session(role), view: role === 'host' ? setup() : live(),
    httpCalls: [] as { path: string; body: any; method: string }[],
    http: undefined as undefined | ((path: string, body: any, method: string) => Promise<Response> | Response | undefined),
    command: undefined as undefined | ((name: string, body: any, ack: Ack) => boolean),
    generation: 1,
  };
  socket.handler = (name, body, ack) => {
    if (h.command?.(name, body, ack)) return;
    const reply = { requestId: body.requestId, gameId: name === 'game.join' ? game : body.gameId, revision: h.view.revision };
    if (name === 'game.resume') ack(null, { ...reply, outcome: 'RESUMED', control: role === 'host' ? null : grant(h.generation, h.discovery.tabId) });
    else if (name === 'game.join') ack(null, { ...reply, outcome: 'JOINED', control: grant(h.generation, h.discovery.tabId) });
    else if (name === 'player.claimControl') ack(null, { ...reply, outcome: 'CONTROL_GRANTED', control: grant(++h.generation, h.discovery.tabId) });
    else if (name === 'state.get') ack(null, { ...reply, gameId: h.view.gameId, outcome: 'STATE', view: h.view });
    else if (name === 'clock.sample') ack(null, { ...reply, outcome: 'CLOCK', sampleId: body.payload.sampleId, serverNowMs: clock + 250 });
    else if (name === 'answer.submit') ack(null, { ...reply, outcome: 'REJECTED', roundId: body.roundId, locked: false });
    else if (name === 'game.start') ack(null, { ...reply, outcome: 'STARTED' });
    else if (name === 'player.remove') ack(null, { ...reply, outcome: 'REMOVED', targetPlayerId: body.payload.targetPlayerId });
  };
  const client = new GameClient({ socket: () => socket, now,
    storage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) },
    fetch: (async (input, init) => {
      const path = String(input), method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      h.httpCalls.push({ path, body, method });
      const custom = h.http?.(path, body, method); if (custom) return custom;
      if (path === '/api/session' || path === '/api/owner/exchange') return json(h.discovery);
      if (path.startsWith('/api/snapshot')) return json(h.view);
      if (path === '/api/host/import') return json({ ...candidate, expectedGameId: h.view.gameId, expectedSetupGeneration: 'setupGeneration' in h.view ? h.view.setupGeneration : 0 });
      throw new Error('Unexpected HTTP call: ' + path);
    }) as typeof fetch,
  });
  clients.push(client);
  return { ...h, client, // Use getters so test assignments are visible to the transport closures.
    get discovery() { return h.discovery; }, set discovery(value) { h.discovery = value; },
    get view() { return h.view; }, set view(value) { h.view = value; },
    get command() { return h.command; }, set command(value) { h.command = value; },
    get http() { return h.http; }, set http(value) { h.http = value; },
    get generation() { return h.generation; }, set generation(value) { h.generation = value; },
  };
}
async function connected(h: ReturnType<typeof harness>) {
  if (h.discovery.role === 'host' && h.view.gameId) h.discovery = session('host', { hostGameId: h.view.gameId,
    lastGameCommit: { requestId: 'prior.1', candidateId: 'prior', gameId: h.view.gameId, setupGeneration: 1, revision: 2 } });
  await h.client.boot(); await flush(); expect(h.client.getSnapshot().status).toBe('connected');
}

describe('browser discovery and control', () => {
  it('discovers before connecting, then resumes with the server membership and stores only continuation proof', async () => {
    const h = harness(); await connected(h);
    expect(h.httpCalls[0].body).toEqual({ protocolVersion: 1, page: { kind: 'fresh' } });
    expect(h.socket.calls[0]).toMatchObject({ name: 'game.resume', body: { gameId: game, payload: { mode: 'bootstrap' } } });
    expect(h.client.getSnapshot().view).toEqual(live());
    expect(JSON.parse(h.saved.get('niche.continuation.v1')!)).toEqual(grant().continuation);
    expect([...h.saved.keys()]).toEqual(['niche.continuation.v1']);
  });
  it('resumes a valid controlling reload with its continuation record', async () => {
    const h = harness('player', new Map([['niche.continuation.v1', JSON.stringify(grant().continuation)]]));
    await connected(h);
    expect(h.httpCalls[0].body.page).toEqual({ kind: 'continuation', record: grant().continuation });
  });
  it('preserves malformed metadata as ambiguous and requires explicit control for stale discovery', async () => {
    vi.useFakeTimers();
    const h = harness('player', new Map([['niche.continuation.v1', '{broken']]));
    h.discovery = session('player', { resume: 'confirmation-required' });
    await h.client.boot(); await flush();
    expect(h.httpCalls[0].body.page).toEqual({ kind: 'ambiguous' });
    expect(h.client.getSnapshot().status).toBe('superseded');
    await vi.advanceTimersByTimeAsync(60000); expect(h.socket.connectCount).toBe(0);
    h.view = live({ controlGeneration: 2 });
    await h.client.claimControl(); await flush();
    expect(h.client.getSnapshot().status).toBe('connected');
    expect(h.client.getSnapshot().controlGeneration).toBe(2);
    expect(h.socket.calls.filter(call => call.name === 'game.resume')).toHaveLength(0);
  });
  it('freezes on transport loss and resumes the loaded page without another bootstrap or new generation', async () => {
    vi.useFakeTimers(); const h = harness(); await connected(h);
    h.socket.lose(); expect(h.client.getSnapshot().status).toBe('reconnecting');
    const count = h.socket.calls.length; await h.client.submit('Fall'); expect(h.socket.calls).toHaveLength(count);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(h.client.getSnapshot().status).toBe('connected');
    expect(h.socket.calls.filter(call => call.name === 'game.resume').at(-1)?.body.payload.mode).toBe('loaded');
    expect(h.client.getSnapshot().controlGeneration).toBe(1);
    expect(h.httpCalls.filter(call => call.path === '/api/session')).toHaveLength(1);
  });
  it('recognizes removal from a forced disconnect without registering another page', async () => {
    const h = harness(); await connected(h);
    h.http = path => path.startsWith('/api/snapshot') ? json({ code: 'REMOVED', message: 'Removed.' }, 403) : undefined;
    h.socket.lose('io server disconnect'); await flush();
    expect(h.client.getSnapshot().status).toBe('removed');
    expect(h.httpCalls.filter(call => call.path === '/api/session')).toHaveLength(1);
    expect(h.httpCalls.at(-1)?.method).toBe('GET');
  });
  it('recognizes revoked host credentials and does not keep reconnecting', async () => {
    vi.useFakeTimers(); const h = harness('host'); await connected(h);
    h.http = path => path.startsWith('/api/snapshot') ? json({ code: 'UNAUTHORIZED', message: 'Access revoked.' }, 401) : undefined;
    h.socket.lose('io server disconnect'); await flush();
    expect(h.client.getSnapshot().status).toBe('host-revoked');
    const count = h.socket.connectCount; await vi.advanceTimersByTimeAsync(60000); expect(h.socket.connectCount).toBe(count);
  });
  it('retains a frozen host view and launcher recovery status when discovery finds a cleared host cookie', async () => {
    const h = harness('host'); await connected(h);
    const previous = h.client.getSnapshot().view, connects = h.socket.connectCount;
    h.discovery = session('guest');
    await h.client.boot(); await flush();
    expect(h.client.getSnapshot().status).toBe('host-revoked');
    expect(h.client.getSnapshot().session?.role).toBe('guest');
    expect(h.client.getSnapshot().view).toEqual(previous);
    expect(h.client.getSnapshot().error?.message).toContain('Open host page');
    expect(h.socket.connectCount).toBe(connects);
    const commands = h.socket.calls.length; await h.client.start(); await h.client.remove('player'); await h.client.join('001234', 'Host');
    expect(h.socket.calls).toHaveLength(commands);
  });
  it('closes the old host session on a changed instance instead of reporting ordinary host revocation', async () => {
    const h = harness('host'); await connected(h);
    h.discovery = session('guest', { serverInstanceId: 'replacement-instance' });
    await h.client.boot(); await flush();
    expect(h.client.getSnapshot().status).toBe('closed'); expect(h.client.getSnapshot().view).toBeNull();
    expect(h.client.getSnapshot().error?.code).toBe('WRONG_INSTANCE');
  });
  it('does not reclaim a superseded tab automatically, and ignores a stale control grant after another takeover', async () => {
    vi.useFakeTimers(); const h = harness(); await connected(h);
    h.socket.fire('player.superseded', { protocolVersion: 1, serverInstanceId: instance, gameId: game, tabId: tab, revision: 2, controlGeneration: 2 });
    await vi.advanceTimersByTimeAsync(60000); expect(h.socket.connectCount).toBe(1);
    let delayed: Ack | undefined;
    h.command = (name, _body, ack) => { if (name === 'player.claimControl') { delayed = ack; return true; } return false; };
    const claim = h.client.claimControl(); await flush();
    const body = h.socket.calls.findLast(call => call.name === 'player.claimControl')!.body;
    h.socket.fire('player.superseded', { protocolVersion: 1, serverInstanceId: instance, gameId: game, tabId: tab, revision: 4, controlGeneration: 4 });
    delayed!(null, { requestId: body.requestId, gameId: game, revision: 3, outcome: 'CONTROL_GRANTED', control: grant(3) });
    await claim; expect(h.client.getSnapshot().status).toBe('superseded');
    expect(h.client.getSnapshot().controlGeneration).toBe(1);
  });
  it('recovers an uncertain admission with ambiguous discovery instead of issuing a fresh join', async () => {
    const h = harness('guest'); await connected(h);
    h.command = (name, _body, ack) => { if (name === 'game.join') { h.discovery = session('player', { tabId: 'recovered', requestPrefix: 'new', resume: 'confirmation-required' }); ack(new Error('lost')); return true; } return false; };
    await h.client.join('001234', 'Diver'); await flush();
    const calls = h.socket.calls.filter(call => call.name === 'game.join');
    expect(calls).toHaveLength(3); expect(new Set(calls.map(call => call.body.requestId)).size).toBe(1);
    expect(h.httpCalls.at(-1)?.body.page.kind).toBe('ambiguous');
    expect(h.client.getSnapshot().session?.role).toBe('player'); expect(h.client.getSnapshot().status).toBe('superseded');
  });
  it('starts clock synchronization immediately after guest admission', async () => {
    const h = harness('guest'); await connected(h); await h.client.join('001234', 'Diver'); await flush();
    expect(h.client.getSnapshot().session?.role).toBe('player');
    expect(h.socket.calls.filter(call => call.name === 'clock.sample')).toHaveLength(3);
  });
});

describe('complete views, answers and clock', () => {
  it('rejects stale revisions, other instances/games/players and equal-revision phase changes', async () => {
    const h = harness(); await connected(h);
    h.socket.fire('state.changed', live({ revision: 2, readiness: { accepted: 1, eligible: 2 } }));
    for (const value of [live(), live({ revision: 5, serverInstanceId: 'other' }), live({ revision: 5, gameId: 'other' }), live({ revision: 5, ownPlayer: { playerId: 'other', nickname: 'Other' } }), live({ revision: 2, phaseId: 'wrong-phase' })]) h.socket.fire('state.changed', value);
    expect(h.client.getSnapshot().view?.revision).toBe(2);
    expect(h.client.getSnapshot().view?.phaseId).toBe('phase');
  });
  it('records a rejection without losing text or storing an answer draft', async () => {
    const h = harness(); await connected(h); await h.client.submit('nonsense');
    expect(h.client.getSnapshot().answerFeedback).toEqual({ roundId: 'round', status: 'rejected', submittedText: 'nonsense' });
    expect([...h.saved.values()].join('')).not.toContain('nonsense');
  });
  it('ignores an accepted acknowledgement delivered after the server has revealed the round', async () => {
    const h = harness(); await connected(h); let delayed: Ack | undefined;
    h.command = (name, _body, ack) => { if (name === 'answer.submit') { delayed = ack; return true; } return false; };
    const submission = h.client.submit('Fall'); await flush();
    const body = h.socket.calls.findLast(call => call.name === 'answer.submit')!.body;
    h.socket.fire('state.changed', results());
    delayed!(null, { requestId: body.requestId, gameId: game, revision: 2, roundId: 'round', outcome: 'ACCEPTED', submittedText: 'Fall', locked: true });
    await submission;
    expect(h.client.getSnapshot().view?.phase).toBe('Results'); expect(h.client.getSnapshot().answerFeedback).toBeNull();
  });
  it('retries a lost answer twice with the same ID and confirms acceptance from a fresh view', async () => {
    const h = harness(); await connected(h);
    h.command = (name, _body, ack) => { if (name === 'answer.submit') { h.view = live({ revision: 2, ownAnswer: { locked: true, submittedText: 'Fall' }, readiness: { accepted: 1, eligible: 2 } }); ack(new Error('lost')); return true; } return false; };
    await h.client.submit('Fall');
    const attempts = h.socket.calls.filter(call => call.name === 'answer.submit');
    expect(attempts).toHaveLength(3); expect(new Set(attempts.map(call => call.body.requestId)).size).toBe(1);
    expect(h.client.getSnapshot().answerFeedback).toEqual({ roundId: 'round', status: 'accepted', submittedText: 'Fall' });
    expect(JSON.stringify(h.client.getSnapshot().answerFeedback)).not.toContain('tier');
  });
  it('keeps an unresolved answer uncertain and reconnects the socket after both submission and state read fail', async () => {
    vi.useFakeTimers(); const h = harness(); await connected(h);
    h.command = (name, _body, ack) => { if (name === 'answer.submit') { h.socket.connected = false; ack(new Error('lost')); return true; } return false; };
    await h.client.submit('Fall');
    expect(h.client.getSnapshot().status).toBe('reconnecting'); expect(h.client.getSnapshot().answerFeedback?.status).toBe('confirming');
    h.command = undefined;
    h.view = live({ revision: 2, ownAnswer: { locked: true, submittedText: 'Fall' }, readiness: { accepted: 1, eligible: 2 } });
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(h.socket.connectCount).toBe(2); expect(h.client.getSnapshot().answerFeedback?.status).toBe('accepted');
  });
  it('synchronizes a closed-round error rather than showing an ordinary invalid-answer rejection', async () => {
    const h = harness(); await connected(h);
    h.command = (name, body, ack) => { if (name === 'answer.submit') { h.view = results(); ack(null, { requestId: body.requestId, code: 'NOT_ANSWERING', message: 'Round ended.' }); return true; } return false; };
    await h.client.submit('Fall'); expect(h.client.getSnapshot().view?.phase).toBe('Results'); expect(h.client.getSnapshot().answerFeedback).toBeNull();
  });
  it('samples the clock three times at connection and again after thirty seconds', async () => {
    vi.useFakeTimers(); const h = harness(); await connected(h);
    expect(h.socket.calls.filter(call => call.name === 'clock.sample')).toHaveLength(3);
    expect(h.client.getSnapshot().clockOffsetMs).toBe(250);
    await vi.advanceTimersByTimeAsync(30000); await flush();
    expect(h.socket.calls.filter(call => call.name === 'clock.sample')).toHaveLength(6);
  });
  it('anchors monotonic server time before exposing a view, refines it once sampled, and does not drift with broadcasts', async () => {
    const epochNow = 1_800_000_000_000, h = harness('player', new Map(), () => epochNow);
    let sampleAck!: Ack, sampleBody: any;
    h.command = (name, body, ack) => { if (name === 'clock.sample') { sampleBody = body; sampleAck = ack; return true; } return false; };
    await connected(h);
    expect(h.client.getSnapshot().clockOffsetMs).toBe(clock - epochNow);
    await h.client.submit('Fall');
    expect(h.socket.calls.filter(call => call.name === 'answer.submit')).toHaveLength(1);
    h.command = undefined;
    sampleAck(null, { requestId: sampleBody.requestId, gameId: game, revision: 1, outcome: 'CLOCK', sampleId: sampleBody.payload.sampleId, serverNowMs: clock + 250 });
    await flush(); expect(h.client.getSnapshot().clockOffsetMs).toBe(clock + 250 - epochNow);
    h.socket.fire('state.changed', live({ revision: 2, serverNowMs: clock + 1000 }));
    expect(h.client.getSnapshot().clockOffsetMs).toBe(clock + 250 - epochNow);
    h.view = live({ revision: 3, serverNowMs: clock + 2000 });
    h.command = (name, _body, _ack) => name === 'clock.sample';
    await h.client.boot(); await flush();
    expect(h.client.getSnapshot().clockOffsetMs).toBe(clock + 2000 - epochNow);
  });
  it('keeps recap data scoped to the current instance/game and ignores delayed old-game details', async () => {
    const h = harness('host'); h.view = finished(); await connected(h);
    h.view = finished({ requestedDetail: { roundId: 'round', results: publicResults } });
    await h.client.recap('round'); expect(h.client.getSnapshot().recapCache.round).toEqual(publicResults);
    const next = lobby({ gameId: 'new-game', revision: 5, phaseId: 'next-lobby', setupGeneration: 2 });
    h.socket.fire('state.changed', next); expect(h.client.getSnapshot().recapCache).toEqual({});
    h.socket.fire('state.changed', finished({ requestedDetail: { roundId: 'round', results: publicResults } }));
    expect(h.client.getSnapshot().view?.gameId).toBe('new-game'); expect(h.client.getSnapshot().recapCache).toEqual({});
  });
  it('does not close a replacement host game when a delayed recap read rejects the old game', async () => {
    const h = harness('host'); h.view = finished(); await connected(h);
    h.command = (name, body, ack) => {
      if (name === 'state.get' && body.payload.recapRoundId) {
        h.view = lobby({ gameId: 'new-game', revision: 5, phaseId: 'new-lobby', setupGeneration: 2 });
        h.socket.fire('state.changed', h.view);
        ack(null, { requestId: body.requestId, code: 'WRONG_GAME', message: 'Old game.' }); return true;
      }
      return false;
    };
    await h.client.recap('round');
    expect(h.client.getSnapshot().status).toBe('connected'); expect(h.client.getSnapshot().view?.gameId).toBe('new-game'); expect(h.client.getSnapshot().recapCache).toEqual({});
  });
});

describe('host mutation reconciliation and provider failures', () => {
  const file = () => new File(['{}'], 'game.json', { type: 'application/json' });
  it.each(['APPLIED', 'NOT_APPLIED', 'SUPERSEDED'] as const)('resolves %s after three lost commit responses without creating a new operation', async outcome => {
    const h = harness('host'); await connected(h); await h.client.upload(file());
    let committed: any;
    h.http = (path, body) => {
      if (path === '/api/host/games') { committed = { ...body, outcome: 'COMMITTED', gameId: game, revision: 2, setupGeneration: 1 }; delete committed.protocolVersion; delete committed.serverInstanceId; delete committed.tabId; delete committed.expectedGameId; delete committed.expectedSetupGeneration; return new Response('<html>Bad gateway</html>', { status: 502 }); }
      if (path === '/api/host/operations/resolve') return json({ outcome, ...(outcome === 'APPLIED' ? { result: committed } : {}), view: outcome === 'NOT_APPLIED' ? setup() : lobby() });
    };
    await h.client.commit();
    const commits = h.httpCalls.filter(call => call.path === '/api/host/games');
    expect(commits).toHaveLength(3); expect(new Set(commits.map(call => call.body.requestId)).size).toBe(1);
    expect(h.httpCalls.find(call => call.path === '/api/host/operations/resolve')?.body.operation.original).toEqual(commits[0].body);
    expect(h.client.getSnapshot().pending).toBeNull(); expect(h.saved.has('niche.host-operation.v1')).toBe(false);
    expect(h.client.getSnapshot().error?.code ?? null).toBe(outcome === 'APPLIED' ? null : outcome);
    expect(h.client.getSnapshot().view?.phase).toBe(outcome === 'NOT_APPLIED' ? 'Setup' : 'Lobby');
  });
  it('preserves Confirming game and persisted operation identity while the resolution endpoint returns provider HTML', async () => {
    vi.useFakeTimers(); const h = harness('host'); await connected(h); await h.client.upload(file());
    h.http = path => path === '/api/host/games' || path === '/api/host/operations/resolve' ? new Response('<html>Provider quota</html>', { status: 429 }) : undefined;
    await h.client.commit();
    expect(h.client.getSnapshot().pending?.label).toBe('Confirming game…'); expect(h.saved.has('niche.host-operation.v1')).toBe(true);
    await h.client.commit(); expect(h.httpCalls.filter(call => call.path === '/api/host/games')).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1000); await flush();
    expect(h.httpCalls.filter(call => call.path === '/api/host/operations/resolve')).toHaveLength(2);
    expect(h.client.getSnapshot().pending?.kind).toBe('commit');
  });
  it('reconciles the original pending operation after reload, including its retired page ID', async () => {
    const original = { protocolVersion: 1, serverInstanceId: instance, tabId: 'old-page', requestId: 'old.7', candidateId: 'candidate', expectedGameId: null, expectedSetupGeneration: 0 };
    const saved = new Map([['niche.host-operation.v1', JSON.stringify({ kind: 'game.commit', original })]]);
    const h = harness('host', saved);
    h.http = path => path === '/api/host/operations/resolve' ? json({ outcome: 'APPLIED', result: { outcome: 'COMMITTED', requestId: 'old.7', candidateId: 'candidate', gameId: game, revision: 2, setupGeneration: 1 }, view: lobby() }) : undefined;
    h.view = lobby(); await connected(h);
    expect(h.httpCalls.find(call => call.path === '/api/host/operations/resolve')?.body.operation.original).toEqual(original);
    expect(h.httpCalls.filter(call => call.path === '/api/host/games')).toHaveLength(0);
    expect(h.client.getSnapshot().view?.phase).toBe('Lobby'); expect(saved.has('niche.host-operation.v1')).toBe(false);
  });
  it('clears an expired candidate while retaining the existing finished results', async () => {
    const h = harness('host'); h.view = finished(); await connected(h); await h.client.upload(file());
    h.http = path => path === '/api/host/games' ? json({ code: 'CANDIDATE_EXPIRED', message: 'Validate the file again.' }, 409) : undefined;
    await h.client.commit(); expect(h.client.getSnapshot().candidate).toBeNull(); expect(h.client.getSnapshot().view?.phase).toBe('Finished'); expect(h.client.getSnapshot().error?.code).toBe('CANDIDATE_EXPIRED');
  });
  it('freezes after a proved commit whose state synchronization is interrupted', async () => {
    const h = harness('host'); await connected(h); await h.client.upload(file());
    h.http = (path, body) => path === '/api/host/games' ? json({ outcome: 'COMMITTED', requestId: body.requestId, candidateId: 'candidate', gameId: game, setupGeneration: 1, revision: 2 }) : undefined;
    h.command = (name, _body, ack) => { if (name === 'state.get') { ack(new Error('lost')); return true; } return false; };
    await h.client.commit(); expect(h.client.getSnapshot().status).toBe('reconnecting'); expect(h.client.getSnapshot().pending).toBeNull();
    expect(h.httpCalls.filter(call => call.path === '/api/host/operations/resolve')).toHaveLength(0);
  });
  it('treats interrupted discovery HTML as transport failure and retries discovery without a join', async () => {
    vi.useFakeTimers(); const h = harness('guest'); let failed = false;
    h.http = path => path === '/api/session' && !failed ? (failed = true, new Response('<html>502</html>', { status: 502 })) : undefined;
    await h.client.boot(); expect(h.client.getSnapshot().status).toBe('error'); expect(h.socket.connectCount).toBe(0);
    await vi.advanceTimersByTimeAsync(1000); await flush(); expect(h.client.getSnapshot().status).toBe('connected');
    expect(h.socket.calls).toHaveLength(0);
  });
  it('keeps capacity errors distinct and waits for explicit retry', async () => {
    vi.useFakeTimers(); const h = harness('guest');
    h.http = path => path === '/api/session' ? json({ code: 'SESSION_CAPACITY', message: 'The host is temporarily busy.' }, 503) : undefined;
    await h.client.boot(); expect(h.client.getSnapshot().error?.code).toBe('SESSION_CAPACITY');
    await vi.advanceTimersByTimeAsync(60000); expect(h.httpCalls).toHaveLength(1);
  });
  it('terminates the old game when a reconnect discovers a changed server instance', async () => {
    const h = harness(); await connected(h);
    h.http = path => path.startsWith('/api/snapshot') ? json({ code: 'WRONG_INSTANCE', message: 'Host restarted.' }, 409) : undefined;
    h.socket.lose('io server disconnect'); await flush();
    expect(h.client.getSnapshot().status).toBe('closed');
  });
  it('discards a delayed import summary if another host page changed the game', async () => {
    const h = harness('host'); await connected(h);
    let release!: (response: Response) => void;
    h.http = path => path === '/api/host/import' ? new Promise<Response>(resolve => { release = resolve; }) : undefined;
    const upload = h.client.upload(file()); await flush();
    h.socket.fire('state.changed', lobby());
    release(json(candidate)); await upload;
    expect(h.client.getSnapshot().candidate).toBeNull(); expect(h.client.getSnapshot().error?.code).toBe('CANDIDATE_STALE');
    expect(h.client.getSnapshot().view?.phase).toBe('Lobby');
  });
  it('restores connected state after explicit retry resolves an exhausted host confirmation', async () => {
    vi.useFakeTimers(); const h = harness('host'); await connected(h); await h.client.upload(file());
    h.http = path => path === '/api/host/games' || path === '/api/host/operations/resolve' ? new Response('gateway', { status: 502 }) : undefined;
    await h.client.commit();
    await vi.advanceTimersByTimeAsync(60000); await flush();
    expect(h.client.getSnapshot().status).toBe('error');
    h.http = path => path === '/api/host/operations/resolve' ? json({ outcome: 'NOT_APPLIED', view: setup() }) : undefined;
    await h.client.retry();
    expect(h.client.getSnapshot().status).toBe('connected'); expect(h.client.getSnapshot().pending).toBeNull();
    expect(h.client.getSnapshot().error?.code).toBe('NOT_APPLIED');
  });
  it('resolves a removal overtaken by another host replacing the game without closing the new view', async () => {
    const h = harness('host'); h.view = lobby(); await connected(h);
    const next = lobby({ gameId: 'new-game', revision: 5, phaseId: 'new-lobby', setupGeneration: 2 });
    h.command = (name, body, ack) => {
      if (name === 'player.remove') { h.view = next; h.socket.fire('state.changed', next); ack(null, { requestId: body.requestId, code: 'WRONG_GAME', message: 'Old game.' }); return true; }
      return false;
    };
    h.http = path => path === '/api/host/operations/resolve' ? json({ outcome: 'SUPERSEDED', view: next }) : undefined;
    await h.client.remove('player');
    expect(h.client.getSnapshot().status).toBe('connected'); expect(h.client.getSnapshot().view?.gameId).toBe('new-game');
    expect(h.client.getSnapshot().error?.code).toBe('SUPERSEDED'); expect(h.client.getSnapshot().pending).toBeNull();
  });
});
