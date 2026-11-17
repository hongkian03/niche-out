import { afterEach, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { io } from 'socket.io-client';
import { createGameApplication } from '../../apps/server/src/game/application.js';
import { twoPromptPack } from '../fixtures/game.js';

const origin = 'https://production.example.com';
const cleanups: (() => Promise<unknown> | void)[] = [];
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close(); });
async function setup(options: { now?: () => number; onActiveChange?: (active: boolean) => void } = {}) {
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
    const response = owner ? await http('/api/owner/exchange', { protocolVersion: 2, token: app.mintOwnerLink().split('#')[1] }) : await http('/api/session', { protocolVersion: 2, page }, previousCookie);
    expect(response.status).toBe(200);
    const cookie = response.headers['set-cookie']?.[0]?.split(';')[0] ?? previousCookie!;
    const discovery = response.body; let sequence = 0;
    const envelope = (payload = {}, gameId: string | null = discovery.membership?.gameId ?? discovery.hostGameId ?? null) => ({ protocolVersion: 2, serverInstanceId: 'instance', tabId: discovery.tabId, requestId: discovery.requestPrefix + '.' + (++sequence), gameId, payload });
    const socket = io('http://127.0.0.1:' + app.port, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'],
      extraHeaders: { Host: new URL(origin).host, Origin: origin, Cookie: cookie }, auth: { protocolVersion: 2, serverInstanceId: 'instance', tabId: discovery.tabId } });
    cleanups.push(() => { socket.disconnect(); });
    socket.connect(); await new Promise<void>((resolve, reject) => { socket.once('connect', () => resolve()); socket.once('connect_error', reject); });
    const send = (kind: string, input: any) => new Promise<any>((resolve, reject) => socket.timeout(2000).emit(kind, input, (error: unknown, value: unknown) => error ? reject(error) : resolve(value)));
    const state = async (gameId: string | null, recapRoundId?: string) => (await send('state.get', envelope(recapRoundId ? { recapRoundId } : {}, gameId))).view;
    return { cookie, discovery, socket, envelope, send, state };
  };
  const game = async (host: Awaited<ReturnType<typeof browser>>, fast = false) => {
    const pack = twoPromptPack(); pack.settings = { readingSeconds: 3, answerSeconds: 25, resultsSeconds: 10 };
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

describe('packaged lifecycle application integration', () => {
  it('retains locks across an expired-phase wake, starts the next phase fresh, and scopes power to timed play', async () => {
    let time = 0; const power: boolean[] = [];
    const h = await setup({ now: () => time, onActiveChange: active => power.push(active) });
    const host = await h.browser(true), a = await h.browser(), b = await h.browser(), g = await h.game(host);
    const joined = await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }));
    await b.send('game.join', b.envelope({ code: g.code, nickname: 'Ben' }));
    expect(power).toEqual([]);
    await host.send('game.start', host.envelope({}, g.gameId)); expect(power).toEqual([true]);
    time = 3000; h.app.reconcileAfterInterruption();
    let view = await a.state(g.gameId); expect(view.phase).toBe('Answering'); expect(view.phaseDeadlineMs).toBe(28000);
    await a.send('answer.submit', { ...a.envelope({ text: 'Ink fin' }, g.gameId), roundId: view.roundId, controlGeneration: joined.control.controlGeneration });
    h.app.setHostingStatus({ status: 'reconnecting', publicOrigin: origin });
    time = 100000; h.app.reconcileAfterInterruption();
    view = await a.state(g.gameId); expect(view.phase).toBe('Results'); expect(view.roundIndex).toBe(0);
    expect(view.phaseDeadlineMs).toBe(110000); expect(view.ownResult.submittedText).toBe('Ink fin');
    expect(view.standings.find((x: any) => x.nickname === 'Ada').publishedTotal).toBe(50);
    expect(view.standings.find((x: any) => x.nickname === 'Ben').publishedTotal).toBe(0);
    h.app.setHostingStatus({ status: 'ready', publicOrigin: origin });
    expect(() => h.app.configureOrigin('https://replacement.example.com')).toThrow('fresh application');
    time = 110000; h.app.reconcileAfterInterruption();
    view = await a.state(g.gameId); expect(view.phase).toBe('Reading'); expect(view.roundIndex).toBe(1); expect(view.phaseDeadlineMs).toBe(113000);
    time = 113000; h.app.reconcileAfterInterruption();
    time = 138000; h.app.reconcileAfterInterruption();
    time = 148000; h.app.reconcileAfterInterruption();
    expect((await a.state(g.gameId)).phase).toBe('Finished'); expect(power).toEqual([true, false]);
    await h.app.close(); expect(power).toEqual([true, false]);
  });
  it('releases the active-game power request when hosting ends before a game finishes', async () => {
    const power: boolean[] = []; const h = await setup({ now: () => 0, onActiveChange: active => power.push(active) });
    const host = await h.browser(true), a = await h.browser(), g = await h.game(host);
    await a.send('game.join', a.envelope({ code: g.code, nickname: 'Ada' }));
    await host.send('game.start', host.envelope({}, g.gameId)); await h.app.close(); expect(power).toEqual([true, false]);
  });
});
