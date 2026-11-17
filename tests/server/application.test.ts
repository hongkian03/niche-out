import { afterEach, describe, expect, it } from 'vitest';
import { request, createServer } from 'node:http';
import { io, type Socket } from 'socket.io-client';
import { createGameApplication, type GameApplicationOptions } from '../../apps/server/src/game/application.js';
import { completeView, resolution } from '../../packages/contracts/src/index.js';
import { twoPromptPack } from '../fixtures/game.js';

const origin = 'https://production.example.com';
const cleanups: (() => Promise<unknown> | void)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function setup(options: GameApplicationOptions = {}) {
  const app = await createGameApplication('instance', 'health-nonce', { port: 0, ...options }); cleanups.push(() => app.close());
  app.configureOrigin(origin); app.setHostingStatus({ status: 'ready', publicOrigin: origin });
  const http = (path: string, body?: unknown, cookie = '', extra: Record<string, string> = {}, method?: string) => new Promise<{ status: number; body: any; headers: any }>((resolve, reject) => {
    const bytes = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);
    const req = request({ hostname: '127.0.0.1', port: app.port, agent: false, method: method ?? (body === undefined ? 'GET' : 'POST'), path,
      headers: { Host: new URL(origin).host, Origin: origin, Cookie: cookie, ...(bytes === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) }), ...extra } }, res => {
      const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => {
        const text = Buffer.concat(chunks).toString(); let value: unknown; try { value = JSON.parse(text); } catch { value = text; }
        resolve({ status: res.statusCode!, body: value, headers: res.headers });
      });
    }); req.on('error', error => { if ((error as NodeJS.ErrnoException).code === 'EPIPE') setTimeout(() => reject(error), 50); else reject(error); }); req.end(bytes);
  });
  const browser = async (owner = false, previousCookie?: string, page: object = { kind: 'fresh' }) => {
    const response = owner ? await http('/api/owner/exchange', { protocolVersion: 1, token: app.mintOwnerLink().split('#')[1] }) : await http('/api/session', { protocolVersion: 1, page }, previousCookie);
    expect(response.status).toBe(200);
    const cookie = response.headers['set-cookie']?.[0]?.split(';')[0] ?? previousCookie!;
    const discovery = response.body; let sequence = 0;
    const envelope = (payload = {}, gameId: string | null = discovery.membership?.gameId ?? discovery.hostGameId ?? null) => ({ protocolVersion: 1, serverInstanceId: 'instance', tabId: discovery.tabId, requestId: discovery.requestPrefix + '.' + (++sequence), gameId, payload });
    const socket = io('http://127.0.0.1:' + app.port, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'],
      extraHeaders: { Host: new URL(origin).host, Origin: origin, Cookie: cookie }, auth: { protocolVersion: 1, serverInstanceId: 'instance', tabId: discovery.tabId } });
    cleanups.push(() => { socket.disconnect(); });
    socket.connect(); await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });
    const send = (kind: string, input: any) => new Promise<any>((resolve, reject) => socket.timeout(2000).emit(kind, input, (error: unknown, value: unknown) => error ? reject(error) : resolve(value)));
    const state = async (gameId: string | null, recapRoundId?: string) => (await send('state.get', envelope(recapRoundId ? { recapRoundId } : {}, gameId))).view;
    return { cookie, discovery, socket, envelope, send, state };
  };
  const game = async (host: Awaited<ReturnType<typeof browser>>, fast = false) => {
    const pack = twoPromptPack(); pack.settings = { readingSeconds: 0.1, answerSeconds: fast ? 0.2 : 2, resultsSeconds: 0.1 };
    const uploaded = await http('/api/host/import', pack, host.cookie); expect(uploaded.status).toBe(200);
    const { gameId: _gameId, payload: _payload, ...common } = host.envelope();
    const input = { ...common, candidateId: uploaded.body.candidateId, expectedGameId: uploaded.body.expectedGameId, expectedSetupGeneration: uploaded.body.expectedSetupGeneration };
    const committed = await http('/api/host/games', input, host.cookie); expect(committed.status).toBe(200); expect(committed.body.outcome).toBe('COMMITTED');
    const view = await host.state(committed.body.gameId); return { gameId: committed.body.gameId as string, code: view.invitation.code as string, input, committed: committed.body };
  };
  const until = async (read: () => Promise<any>, phase: string) => {
    const limit = Date.now() + 6000;
    for (;;) { const state = await read(); if (state?.phase === phase) return state; if (Date.now() >= limit) throw new Error('Phase timeout ' + phase); await new Promise(resolve => setTimeout(resolve, 50)); }
  };
  return { app, http, browser, game, until };
}

describe('production application protocol', () => {
  it('keeps diagnostics private and safe when observers throw, and counts polling HTTP once', async () => {
    const h = await setup({ diagnosticMode: 'detailed', onDiagnostic: () => { throw Error('observer failure'); } });
    const a = await h.browser();
    const before = h.app.diagnosticSnapshot().upstreamTransport.httpRequests;
    const response = await h.http('/socket.io/?EIO=4&transport=polling', undefined, a.cookie);
    expect(response.status).toBe(200);
    expect(h.app.diagnosticSnapshot().upstreamTransport.httpRequests - before).toBe(1);
    expect((await h.http('/api/diagnostics')).status).toBe(404);
    const host = await h.browser(true), g = await h.game(host);
    expect(g.gameId).toBeTruthy();
  });
  it('light diagnostics report commands without duplicate JSON byte/profile work', async () => {
    const samples: any[] = [];
    const h = await setup({ diagnosticMode: 'light', onDiagnostic: sample => samples.push(sample) });
    const host = await h.browser(true); await host.state(null);
    expect(samples.some(sample => sample.kind === 'command')).toBe(true);
    expect(samples.some(sample => sample.kind === 'egress' || sample.kind === 'profile')).toBe(false);
    expect(JSON.stringify(samples)).not.toContain('continuationToken');
  });
  it('serves exact public assets/health and rejects wrong ingress, private files and unauthorized routes', async () => {
    const h = await setup();
    expect((await h.http('/health')).body).toEqual({ protocolVersion: 1, appVersion: '0.1.0', live: true });
    expect((await h.http('/hosting-health')).body.healthToken).toBe('health-nonce');
    expect((await h.http('/host')).status).toBe(200);
    const example = await h.http('/game.example.json');
    expect(example.status).toBe(200); expect(example.headers['content-type']).toContain('application/json'); expect(example.body.schemaVersion).toBe(1);
    for (const path of ['/game-format.txt', '/asset-notices.txt', '/VT323-OFL.txt']) {
      const asset = await h.http(path); expect(asset.status).toBe(200); expect(asset.headers['content-type']).toContain('text/plain');
    }
    expect((await h.http('/health', undefined, '', { Host: 'evil.example.com', 'X-Forwarded-Host': new URL(origin).host })).status).toBe(403);
    expect((await h.http('/api/session', { protocolVersion: 1, page: { kind: 'fresh' } }, '', { Origin: 'https://evil.example.com' })).status).toBe(403);
    expect((await h.http('/api/host/import', twoPromptPack())).status).toBe(401);
    for (const path of ['/docs/game.example.json', '/src/game/application.ts', '/api/controller/start', '/.env']) expect((await h.http(path)).status).toBe(404);
  });
  it('plays two rounds over authenticated sockets with private views, lost commit retry, aliases, removal and final recap', async () => {
    const h = await setup(), host = await h.browser(true), a = await h.browser(), b = await h.browser(), g = await h.game(host);
    expect((await h.http('/api/host/games', g.input, host.cookie)).body).toEqual(g.committed);
    const aj = await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }));
    const bj = await b.send('game.join', b.envelope({ code: g.code, nickname: 'Ben' }));
    expect(aj.outcome).toBe('JOINED'); expect(bj.outcome).toBe('JOINED');
    expect((await a.send('game.start', a.envelope({}, g.gameId))).code).toBe('FORBIDDEN');
    const started = await host.send('game.start', host.envelope({}, g.gameId)); expect(started.outcome).toBe('STARTED');
    const live = await h.until(() => a.state(g.gameId), 'Answering');
    const attempt = { ...a.envelope({ text: 'Ink fin' }, g.gameId), roundId: live.roundId, controlGeneration: aj.control.controlGeneration };
    expect((await a.send('answer.submit', { ...attempt, payload: { text: 'Nope' } })).outcome).toBe('REJECTED');
    const acceptedInput = { ...a.envelope({ text: 'Ink fin' }, g.gameId), roundId: live.roundId, controlGeneration: aj.control.controlGeneration };
    const accepted = await a.send('answer.submit', acceptedInput); expect(accepted.outcome).toBe('ACCEPTED'); expect(JSON.stringify(accepted)).not.toContain('points');
    const hidden = await host.state(g.gameId); expect(hidden.phase).toBe('Answering'); expect(JSON.stringify(hidden)).not.toContain('Inkfin');
    const bInput = { ...b.envelope({ text: 'Inkfin private fixture' }, g.gameId), roundId: live.roundId, controlGeneration: bj.control.controlGeneration };
    const bAccepted = await b.send('answer.submit', bInput); expect(bAccepted.outcome).toBe('ACCEPTED');
    expect(await b.send('answer.submit', bInput)).toEqual(bAccepted);
    const results = await host.state(g.gameId); expect(results.phase).toBe('Results'); expect(results.results.groups[0].count).toBe(2);
    const target = results.standings.find((row: any) => row.nickname === 'Ben').playerId;
    expect((await host.send('player.remove', host.envelope({ targetPlayerId: target }, g.gameId))).outcome).toBe('REMOVED');
    const next = await h.until(() => a.state(g.gameId), 'Answering');
    expect((await a.send('answer.submit', { ...a.envelope({ text: 'Gannet' }, g.gameId), roundId: next.roundId, controlGeneration: aj.control.controlGeneration })).outcome).toBe('ACCEPTED');
    const final = await h.until(() => a.state(g.gameId), 'Finished'); expect(completeView.safeParse(final).success).toBe(true); expect(final.standings[0].publishedTotal).toBe(100);
    expect(final.rounds.map((round: any) => round.ownResult.submittedText)).toEqual(['Ink fin', 'Gannet']);
    const recap = await host.state(g.gameId, live.roundId); expect(recap.requestedDetail.results.groups[0].count).toBe(2); expect(JSON.stringify(recap)).not.toContain('submittedText');
  });
  it('fences uncertain commit and Start, preserves owner recovery and replays matching committed operations', async () => {
    const h = await setup(), host = await h.browser(true);
    const uploaded = await h.http('/api/host/import', twoPromptPack(), host.cookie);
    const { gameId: _, payload: __, ...common } = host.envelope();
    const input = { ...common, candidateId: uploaded.body.candidateId, expectedGameId: null, expectedSetupGeneration: uploaded.body.expectedSetupGeneration };
    const resolved = await h.http('/api/host/operations/resolve', { protocolVersion: 1, operation: { kind: 'game.commit', original: input } }, host.cookie);
    expect(resolved.body.outcome).toBe('NOT_APPLIED'); expect(resolution.safeParse(resolved.body).success).toBe(true);
    expect((await h.http('/api/host/games', input, host.cookie)).body.code).toBe('OPERATION_CANCELLED');
    expect((await h.http('/api/host/operations/resolve', { protocolVersion: 1, operation: { kind: 'game.commit', original: input } }, host.cookie)).body.outcome).toBe('NOT_APPLIED');
    const g = await h.game(host), a = await h.browser(); await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }));
    expect((await h.http('/api/host/operations/resolve', { protocolVersion: 1, operation: { kind: 'game.commit', original: input } }, host.cookie)).body.outcome).toBe('SUPERSEDED');
    const start = host.envelope({}, g.gameId);
    expect((await h.http('/api/host/operations/resolve', { protocolVersion: 1, operation: { kind: 'game.start', original: start } }, host.cookie)).body.outcome).toBe('NOT_APPLIED');
    expect((await host.send('game.start', start)).code).toBe('OPERATION_CANCELLED');
    const oldCookie = host.cookie, recovery = await h.browser(true);
    expect((await h.http('/api/host/import', twoPromptPack(), oldCookie)).status).toBe(401);
    expect((await recovery.state(g.gameId)).roster).toHaveLength(1);
    expect((await h.http('/api/host/operations/resolve', { protocolVersion: 1, operation: { kind: 'game.commit', original: g.input } }, recovery.cookie)).body.outcome).toBe('APPLIED');
  });
  it('preserves player on owner conflict; supports continuation, takeover, and stale generation rejection', async () => {
    const h = await setup(), host = await h.browser(true), a = await h.browser(), g = await h.game(host);
    const joined = await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }));
    const token = h.app.mintOwnerLink().split('#')[1];
    expect((await h.http('/api/owner/exchange', { protocolVersion: 1, token }, a.cookie)).body.code).toBe('HOST_PLAYER_CONFLICT');
    const copy = await h.browser(false, a.cookie, { kind: 'continuation', record: joined.control.continuation });
    const resumed = await copy.send('game.resume', copy.envelope({ mode: 'bootstrap' }, g.gameId)); expect(resumed.control.controlGeneration).toBe(2);
    const stale = await h.browser(false, a.cookie, { kind: 'continuation', record: joined.control.continuation });
    expect((await stale.send('game.resume', stale.envelope({ mode: 'bootstrap' }, g.gameId))).code).toBe('CONTROL_CONFIRMATION_REQUIRED');
    const claimed = await stale.send('player.claimControl', stale.envelope({ explicit: true }, g.gameId)); expect(claimed.control.controlGeneration).toBe(3);
    expect((await h.http('/api/owner/exchange', { protocolVersion: 1, token }, host.cookie)).status).toBe(200);
  });
  it('reports authenticated removal after retiring pages for HTTP inspection and socket reconnection', async () => {
    const h = await setup(), host = await h.browser(true), player = await h.browser(), guest = await h.browser(), g = await h.game(host);
    await player.send('game.join', player.envelope({ code: g.code, nickname: 'Removed diver' }));
    const own = await player.state(g.gameId), disconnected = new Promise<void>(resolve => player.socket.once('disconnect', () => resolve()));
    expect((await host.send('player.remove', host.envelope({ targetPlayerId: own.ownPlayer.playerId }, g.gameId))).outcome).toBe('REMOVED');
    await disconnected;
    const snapshotPath = '/api/snapshot?' + new URLSearchParams({ serverInstanceId: 'instance', gameId: g.gameId, tabId: player.discovery.tabId });
    const removed = await h.http(snapshotPath, undefined, player.cookie);
    expect(removed.status).toBe(403); expect(removed.body.code).toBe('REMOVED');
    expect((await h.http(snapshotPath, undefined, guest.cookie)).body.code).toBe('UNAUTHORIZED');
    expect((await h.http(snapshotPath, undefined, 'niche-browser=invalid')).body.code).toBe('UNAUTHORIZED');
    const error = new Promise<any>(resolve => player.socket.once('connect_error', resolve));
    player.socket.connect(); expect((await error).data.code).toBe('REMOVED');
    const discovery = await h.http('/api/session', { protocolVersion: 1, page: { kind: 'ambiguous' } }, player.cookie);
    expect(discovery.body).toMatchObject({ role: 'player', membership: { status: 'removed' }, resume: 'none' });
  });
  it('rejects malformed and over-limit uploads, leaves prior lobby and serves no staged answer bank', async () => {
    const h = await setup(), host = await h.browser(true), g = await h.game(host);
    expect((await h.http('/api/host/import', '', host.cookie)).body.code).toBe('INVALID_PACK');
    expect((await h.http('/api/host/import', '{', host.cookie)).body.code).toBe('INVALID_PACK');
    // Declared oversize fails before body consumption; worker and public-browser tests exercise actual byte bounds.
    const large = await h.http('/api/host/import', ' ', host.cookie, { 'Content-Length': String(10 * 1024 * 1024 + 1) }); expect(large.status).toBe(413);
    const state = await host.state(g.gameId); expect(state.phase).toBe('Lobby'); expect(state.gameId).toBe(g.gameId);
    expect(state.packSummary).not.toHaveProperty('prompts'); expect(JSON.stringify(state)).not.toContain('Inkfin');
  });
});


describe('production transport boundaries', () => {
  it('falls back from an occupied default loopback port without touching the occupying listener', async () => {
    const occupied = createServer((_req, res) => res.end('occupied'));
    const ownsPort = await new Promise<boolean>((resolve, reject) => { occupied.once('error', error => (error as NodeJS.ErrnoException).code === 'EADDRINUSE' ? resolve(false) : reject(error)); occupied.listen(3210, '127.0.0.1', () => resolve(true)); });
    if (ownsPort) cleanups.push(() => new Promise<void>(resolve => occupied.close(() => resolve())));
    const app = await createGameApplication('port-test', 'nonce'); cleanups.push(() => app.close());
    expect(app.port).toBeGreaterThan(3210); expect(app.port).toBeLessThanOrEqual(3220);
    if (ownsPort) expect(occupied.listening).toBe(true);
  });
  it('enforces raw socket size and protocol version without mutating the roster', async () => {
    const h = await setup(), host = await h.browser(true), g = await h.game(host), a = await h.browser();
    const wrong = await a.send('game.join', { ...a.envelope({ code: g.code, nickname: 'Ada' }), protocolVersion: 2 });
    expect(wrong.code).toBe('UNSUPPORTED_VERSION');
    const malformed = await a.send('game.join', { ...a.envelope({ code: g.code, nickname: 'Ada' }), requestId: 'invalid' });
    expect(malformed.code).toBe('INVALID_PAYLOAD'); expect(malformed).not.toHaveProperty('requestId');
    const disconnected = new Promise<void>(resolve => a.socket.once('disconnect', () => resolve()));
    a.socket.emit('game.join', a.envelope({ code: g.code, nickname: 'x'.repeat(5000) })); await disconnected;
    expect((await host.state(g.gameId)).roster).toEqual([]);
  });
  it('bounds pending namespace handshakes at 128 and expires them while an admitted connection survives', async () => {
    const h = await setup(), host = await h.browser(true), g = await h.game(host), a = await h.browser();
    await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }));
    const requests = await Promise.all(Array.from({ length: 128 }, () => h.http('/socket.io/?EIO=4&transport=polling', undefined, a.cookie)));
    expect(requests.every(response => response.status === 200)).toBe(true);
    expect((await h.http('/socket.io/?EIO=4&transport=polling', undefined, a.cookie)).body.code).toBe('HANDSHAKE_CAPACITY');
    expect((await a.state(g.gameId)).phase).toBe('Lobby');
    await new Promise(resolve => setTimeout(resolve, 10500));
    expect((await h.http('/socket.io/?EIO=4&transport=polling', undefined, a.cookie)).status).toBe(200);
    expect((await a.state(g.gameId)).ownPlayer.nickname).toBe('Ada');
  }, 15000);
  it('uses handler receipt strictly at deadline and publishes a phase immediately instead of a pending readiness batch', async () => {
    let time = 0; const h = await setup({ now: () => time }), host = await h.browser(true), g = await h.game(host), a = await h.browser(), b = await h.browser();
    const aj = await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }));
    const bj = await b.send('game.join', b.envelope({ code: g.code, nickname: 'Ben' }));
    await host.send('game.start', host.envelope({}, g.gameId)); time = 100;
    const live = await h.until(() => a.state(g.gameId), 'Answering');
    const events: any[] = []; host.socket.on('state.changed', view => events.push(view));
    time = live.phaseDeadlineMs - 1;
    const first = await a.send('answer.submit', { ...a.envelope({ text: 'Ink fin' }, g.gameId), roundId: live.roundId, controlGeneration: aj.control.controlGeneration });
    expect(first.outcome).toBe('ACCEPTED');
    time = live.phaseDeadlineMs;
    const late = await b.send('answer.submit', { ...b.envelope({ text: 'Gull' }, g.gameId), roundId: live.roundId, controlGeneration: bj.control.controlGeneration });
    expect(late.code).toBe('EXPIRED');
    const revealed = await host.state(g.gameId); expect(revealed.phase).toBe('Results'); expect(revealed.standings.find((p: any) => p.nickname === 'Ben').roundPoints).toBe(0);
    await new Promise(resolve => setTimeout(resolve, 60));
    const resultIndex = events.findIndex(view => view.phase === 'Results'); expect(resultIndex).toBeGreaterThanOrEqual(0);
    expect(events.slice(resultIndex).every(view => view.phase === 'Results')).toBe(true);
    expect(events.every(view => completeView.safeParse(view).success)).toBe(true);
  });
  it('keeps loaded-page reconnection control and never lets a tunnel outage pause deadlines', async () => {
    const h = await setup(), host = await h.browser(true), g = await h.game(host, true), a = await h.browser();
    const joined = await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }));
    a.socket.disconnect(); a.socket.connect(); await new Promise<void>((resolve, reject) => { a.socket.once('connect', resolve); a.socket.once('connect_error', reject); });
    const resumed = await a.send('game.resume', a.envelope({ mode: 'loaded' }, g.gameId)); expect(resumed.control.controlGeneration).toBe(joined.control.controlGeneration);
    h.app.setHostingStatus({ status: 'reconnecting', publicOrigin: origin });
    expect((await host.send('game.start', host.envelope({}, g.gameId))).code).toBe('TUNNEL_NOT_READY');
    h.app.setHostingStatus({ status: 'ready', publicOrigin: origin }); await host.send('game.start', host.envelope({}, g.gameId));
    h.app.setHostingStatus({ status: 'reconnecting', publicOrigin: origin });
    const final = await h.until(() => a.state(g.gameId), 'Finished'); expect(final.rounds.every((round: any) => round.ownResult.outcome === 'miss')).toBe(true);
  });
});

describe('bounded work and observable revisions', () => {
  it('limits game-code attempts per session after replay lookup while another browser behind the same address can join', async () => {
    let time = 0; const h = await setup({ now: () => time }), host = await h.browser(true), g = await h.game(host), a = await h.browser(), b = await h.browser();
    const wrong = g.code === '000000' ? '111111' : '000000'; let last: any;
    for (let index = 0; index < 8; index++) { last = a.envelope({ code: wrong, nickname: 'Ada' }); expect((await a.send('game.join', last)).code).toBe('GAME_NOT_FOUND'); }
    expect((await a.send('game.join', last)).code).toBe('GAME_NOT_FOUND');
    expect((await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }))).code).toBe('RATE_LIMITED');
    expect((await b.send('game.join', b.envelope({ code: g.code, nickname: 'Ben' }))).outcome).toBe('JOINED');
    time = 1000; expect((await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }))).outcome).toBe('JOINED');
    for (let index = 0; index < 40; index++) expect((await a.send('state.get', a.envelope({}, g.gameId))).outcome).toBe('STATE');
    expect((await a.send('clock.sample', a.envelope({ sampleId: 'sample' }, g.gameId))).code).toBe('RATE_LIMITED');
    expect((await b.state(g.gameId)).ownPlayer.nickname).toBe('Ben');
  });
  it('advances revisions for hosting, control and import completion but not repeated status or read-only state requests', async () => {
    const h = await setup(), host = await h.browser(true), g = await h.game(host), a = await h.browser();
    const joined = await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }));
    const before = await host.state(g.gameId); expect((await host.state(g.gameId)).revision).toBe(before.revision);
    h.app.setHostingStatus({ status: 'ready', publicOrigin: origin }); expect((await host.state(g.gameId)).revision).toBe(before.revision);
    h.app.setHostingStatus({ status: 'reconnecting', publicOrigin: origin }); const reconnect = await host.state(g.gameId); expect(reconnect.revision).toBeGreaterThan(before.revision);
    h.app.setHostingStatus({ status: 'ready', publicOrigin: origin });
    const copy = await h.browser(false, a.cookie, { kind: 'continuation', record: joined.control.continuation });
    const priorControl = (await host.state(g.gameId)).revision;
    await copy.send('game.resume', copy.envelope({ mode: 'bootstrap' }, g.gameId)); expect((await host.state(g.gameId)).revision).toBeGreaterThan(priorControl);
    const beforeImport = (await host.state(g.gameId)).revision;
    expect((await h.http('/api/host/import', twoPromptPack(), host.cookie)).status).toBe(200);
    const afterImport = await host.state(g.gameId); expect(afterImport.revision).toBeGreaterThanOrEqual(beforeImport + 2); expect(afterImport.canStart).toBe(true);
  });
});
