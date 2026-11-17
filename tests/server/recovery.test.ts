import { afterEach, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { io } from 'socket.io-client';
import { createGameApplication } from '../../apps/server/src/game/application.js';
import { resolution } from '../../packages/contracts/src/index.js';
import { twoPromptPack } from '../fixtures/game.js';
const origin = 'https://recovery.example.com';
const cleanups: (() => Promise<unknown> | void)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function setup() {
  let now = 0;
  const app = await createGameApplication('recovery-instance', 'private-health', { port: 0, now: () => now });
  cleanups.push(() => app.close()); app.configureOrigin(origin); app.setHostingStatus({ status: 'ready', publicOrigin: origin });
  const http = (path: string, body?: unknown, cookie = '') => new Promise<{ status: number; body: any; cookie: string }>((resolve, reject) => {
    const bytes = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ hostname: '127.0.0.1', port: app.port, path, method: bytes === undefined ? 'GET' : 'POST', headers: {
      Host: new URL(origin).host, Origin: origin, Cookie: cookie, ...(bytes === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) }),
    } }, res => {
      const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()), cookie: res.headers['set-cookie']?.[0]?.split(';')[0] ?? cookie }));
    }); req.on('error', reject); req.end(bytes);
  });
  const browser = async (owner = false, oldCookie = '') => {
    const response = owner ? await http('/api/owner/exchange', { protocolVersion: 2, token: app.mintOwnerLink().split('#')[1] }, oldCookie) : await http('/api/session', { protocolVersion: 2, page: { kind: 'fresh' } }, oldCookie);
    expect(response.status).toBe(200); let sequence = 0; const discovery = response.body;
    const envelope = (payload: object = {}, gameId: string | null = discovery.membership?.gameId ?? discovery.hostGameId ?? null) => ({ protocolVersion: 2, serverInstanceId: 'recovery-instance', tabId: discovery.tabId, requestId: discovery.requestPrefix + '.' + (++sequence), gameId, payload });
    const socket = io('http://127.0.0.1:' + app.port, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'], extraHeaders: { Host: new URL(origin).host, Origin: origin, Cookie: response.cookie }, auth: { protocolVersion: 2, serverInstanceId: 'recovery-instance', tabId: discovery.tabId } });
    cleanups.push(() => { socket.disconnect(); });
    const connect = async () => { if (socket.connected) return; await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); }); };
    await connect();
    const send = (kind: string, input: unknown) => new Promise<any>((resolve, reject) => socket.timeout(2000).emit(kind, input, (error: unknown, value: unknown) => error ? reject(error) : resolve(value)));
    return { cookie: response.cookie, discovery, envelope, socket, connect, send };
  };
  const candidate = async (host: Awaited<ReturnType<typeof browser>>) => {
    const uploaded = await http('/api/host/import', twoPromptPack(), host.cookie); expect(uploaded.status).toBe(200);
    const { gameId: _, payload: __, ...base } = host.envelope();
    return { ...base, candidateId: uploaded.body.candidateId, expectedGameId: uploaded.body.expectedGameId, expectedSetupGeneration: uploaded.body.expectedSetupGeneration };
  };
  const game = async (host: Awaited<ReturnType<typeof browser>>) => {
    const input = await candidate(host); const result = await http('/api/host/games', input, host.cookie); expect(result.body.outcome).toBe('COMMITTED');
    const view = (await host.send('state.get', host.envelope({}, result.body.gameId))).view;
    return { input, result: result.body, gameId: result.body.gameId as string, code: view.invitation.code as string };
  };
  const resolve = (cookie: string, kind: 'game.commit' | 'game.start' | 'player.remove', original: unknown) => http('/api/host/operations/resolve', { protocolVersion: 2, operation: { kind, original } }, cookie);
  return { app, http, browser, candidate, game, resolve, setNow: (value: number) => { now = value; } };
}
describe('actual-route recovery and bounded identities', () => {
  it('fence-first commit remains NOT_APPLIED after cache expiry; delayed originals cannot create a game', async () => {
    const h = await setup(), host = await h.browser(true), input = await h.candidate(host);
    const first = await h.resolve(host.cookie, 'game.commit', input); expect(first.body.outcome).toBe('NOT_APPLIED'); expect(resolution.safeParse(first.body).success).toBe(true);
    h.setNow(120001);
    expect((await h.resolve(host.cookie, 'game.commit', input)).body.outcome).toBe('NOT_APPLIED');
    expect((await h.http('/api/host/games', input, host.cookie)).body.code).toBe('OPERATION_CANCELLED');
    const view = (await host.send('state.get', host.envelope())).view; expect(view.phase).toBe('Setup');
  });
  it('original-first commit resolves after its owner page is retired and after credential recovery', async () => {
    const h = await setup(), host = await h.browser(true), game = await h.game(host); host.socket.disconnect();
    for (let i = 0; i < 9; i++) expect((await h.http('/api/session', { protocolVersion: 2, page: { kind: 'fresh' } }, host.cookie)).status).toBe(200);
    const recovered = await h.browser(true);
    const result = await h.resolve(recovered.cookie, 'game.commit', game.input);
    expect(result.status).toBe(200); expect(result.body.outcome).toBe('APPLIED'); expect(result.body.result).toEqual(game.result);
    expect(resolution.safeParse(result.body).success).toBe(true);
    expect((await h.http('/api/host/games', game.input, recovered.cookie)).status).not.toBe(200);
  });
  it('fences removal before execution and replays an applied removal without harming the other player', async () => {
    const h = await setup(), host = await h.browser(true), a = await h.browser(), b = await h.browser(), game = await h.game(host);
    await a.send('game.join', a.envelope({ code: game.code, nickname: 'Ada' })); await b.send('game.join', b.envelope({ code: game.code, nickname: 'Ben' }));
    const state = (await host.send('state.get', host.envelope({}, game.gameId))).view;
    const ada = state.roster.find((row: any) => row.nickname === 'Ada').playerId, ben = state.roster.find((row: any) => row.nickname === 'Ben').playerId;
    const fenced = host.envelope({ targetPlayerId: ada }, game.gameId);
    expect((await h.resolve(host.cookie, 'player.remove', fenced)).body.outcome).toBe('NOT_APPLIED');
    expect((await host.send('player.remove', fenced)).code).toBe('OPERATION_CANCELLED');
    const removal = host.envelope({ targetPlayerId: ben }, game.gameId); const applied = await host.send('player.remove', removal); expect(applied.outcome).toBe('REMOVED');
    expect((await h.resolve(host.cookie, 'player.remove', removal)).body.result).toEqual(applied);
    const remaining = (await host.send('state.get', host.envelope({}, game.gameId))).view;
    expect(remaining.roster.map((row: any) => row.nickname)).toEqual(['Ada']);
  });
  it('cannot recover an old successful claim acknowledgement after another tab takes control', async () => {
    const h = await setup(), host = await h.browser(true), a = await h.browser(), game = await h.game(host);
    await a.send('game.join', a.envelope({ code: game.code, nickname: 'Ada' }));
    const b = await h.browser(false, a.cookie);
    await Promise.all([new Promise<void>(resolve => a.socket.once('disconnect', () => resolve())), b.send('game.resume', b.envelope({ mode: 'bootstrap' }, game.gameId))]);
    await a.connect(); const firstClaim = a.envelope({ explicit: true }, game.gameId);
    const bDisconnected = new Promise<void>(resolve => b.socket.once('disconnect', () => resolve()));
    expect((await a.send('player.claimControl', firstClaim)).outcome).toBe('CONTROL_GRANTED'); await bDisconnected;
    await b.connect(); const aDisconnected = new Promise<void>(resolve => a.socket.once('disconnect', () => resolve()));
    expect((await b.send('player.claimControl', b.envelope({ explicit: true }, game.gameId))).outcome).toBe('CONTROL_GRANTED'); await aDisconnected;
    await a.connect(); expect((await a.send('player.claimControl', firstClaim)).code).toBe('TAB_SUPERSEDED');
    expect((await b.send('state.get', b.envelope({}, game.gameId))).view.ownPlayer.nickname).toBe('Ada');
  });
  it('rejects cached old grants even after the same page becomes controller again', async () => {
    const h = await setup(), host = await h.browser(true), a = await h.browser(), game = await h.game(host);
    const join = a.envelope({ code: game.code, nickname: 'Ada' });
    expect((await a.send('game.join', join)).control.controlGeneration).toBe(1);
    const b = await h.browser(false, a.cookie), resume = b.envelope({ mode: 'bootstrap' }, game.gameId);
    const lostA2 = new Promise<void>(resolve => a.socket.once('disconnect', () => resolve()));
    expect((await b.send('game.resume', resume)).control.controlGeneration).toBe(2); await lostA2;
    await a.connect(); const claim = a.envelope({ explicit: true }, game.gameId);
    const lostB3 = new Promise<void>(resolve => b.socket.once('disconnect', () => resolve()));
    expect((await a.send('player.claimControl', claim)).control.controlGeneration).toBe(3); await lostB3;
    expect((await a.send('game.join', join)).code).toBe('TAB_SUPERSEDED');
    await b.connect(); const lostA4 = new Promise<void>(resolve => a.socket.once('disconnect', () => resolve()));
    expect((await b.send('player.claimControl', b.envelope({ explicit: true }, game.gameId))).control.controlGeneration).toBe(4); await lostA4;
    expect((await b.send('game.resume', resume)).code).toBe('TAB_SUPERSEDED');
    await a.connect(); const lostB5 = new Promise<void>(resolve => b.socket.once('disconnect', () => resolve()));
    expect((await a.send('player.claimControl', a.envelope({ explicit: true }, game.gameId))).control.controlGeneration).toBe(5); await lostB5;
    expect((await a.send('player.claimControl', claim)).code).toBe('TAB_SUPERSEDED');
    const loaded = await a.send('game.resume', a.envelope({ mode: 'loaded' }, game.gameId));
    expect(loaded.control.controlGeneration).toBe(5);
    expect(loaded.control.continuation.previousTabId).toBe(a.discovery.tabId);
  });
  it('requires explicit rejoining but supports the same loaded player page after lobby replacement', async () => {
    const h = await setup(), host = await h.browser(true), player = await h.browser(), first = await h.game(host);
    expect((await player.send('game.join', player.envelope({ code: first.code, nickname: 'Ada' }))).outcome).toBe('JOINED');
    const next = await h.game(host); expect(next.gameId).not.toBe(first.gameId);
    expect((await player.send('state.get', player.envelope({}, first.gameId))).code).toBe('WRONG_GAME');
    const rejoined = await player.send('game.join', player.envelope({ code: next.code, nickname: 'Ada' }));
    expect(rejoined).toMatchObject({ outcome: 'JOINED', gameId: next.gameId, control: { controlGeneration: 1 } });
    const roster = (await host.send('state.get', host.envelope({}, next.gameId))).view.roster;
    expect(roster.map((row: any) => row.nickname)).toEqual(['Ada']);
  });
  it('enforces 100 concurrent memberships and restores an existing browser at capacity', async () => {
    const h = await setup(), host = await h.browser(true), game = await h.game(host);
    const players: Awaited<ReturnType<typeof h.browser>>[] = [];
    for (let i = 0; i < 100; i++) {
      const player = await h.browser(); players.push(player);
      const joined = await player.send('game.join', player.envelope({ code: game.code, nickname: 'Player ' + i }));
      expect(joined.outcome).toBe('JOINED');
    }
    const newcomer = await h.browser();
    expect((await newcomer.send('game.join', newcomer.envelope({ code: game.code, nickname: 'Extra' }))).code).toBe('GAME_FULL');
    players[0].socket.disconnect();
    const resumed = await h.browser(false, players[0].cookie);
    expect(resumed.discovery).toMatchObject({ role: 'player', membership: { gameId: game.gameId, nickname: 'Player 0' } });
    expect((await resumed.send('game.resume', resumed.envelope({ mode: 'bootstrap' }, game.gameId))).outcome).toBe('RESUMED');
    expect((await resumed.send('state.get', resumed.envelope({}, game.gameId))).view).toMatchObject({ admittedCount: 100, ownPlayer: { nickname: 'Player 0' } });
    const view = (await host.send('state.get', host.envelope({}, game.gameId))).view;
    expect(view.roster).toHaveLength(100);
    expect(new Set(view.roster.map((row: any) => row.playerId)).size).toBe(100);
  });
  it('bounds guests sharing one address without evicting an admitted player or owner, and reclaims idle guests', async () => {
    const h = await setup(), host = await h.browser(true), player = await h.browser(), game = await h.game(host);
    await player.send('game.join', player.envelope({ code: game.code, nickname: 'Ada' }));
    for (let i = 1; i <= 256; i++) { h.setNow(i * 1000); const guest = await h.http('/api/session', { protocolVersion: 2, page: { kind: 'fresh' } }); expect(guest.status).toBe(200); }
    h.setNow(257000); expect((await h.http('/api/session', { protocolVersion: 2, page: { kind: 'fresh' } })).body.code).toBe('SESSION_CAPACITY');
    expect((await player.send('state.get', player.envelope({}, game.gameId))).view.ownPlayer.nickname).toBe('Ada');
    expect((await host.send('state.get', host.envelope({}, game.gameId))).view.roster).toHaveLength(1);
    h.setNow(900000); expect((await h.http('/api/session', { protocolVersion: 2, page: { kind: 'fresh' } })).status).toBe(200);
    expect((await player.send('state.get', player.envelope({}, game.gameId))).view.ownPlayer.nickname).toBe('Ada');
  });
});
