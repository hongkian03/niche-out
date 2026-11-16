import { afterEach, describe, expect, it } from 'vitest';
import { request, type ClientRequest } from 'node:http';
import { io } from 'socket.io-client';
import { createGameApplication, type GameApplicationOptions } from '../../apps/server/src/game/application.js';
import { twoPromptPack } from '../fixtures/game.js';

const origin = 'https://imports.example.com';
const cleanup: (() => Promise<unknown> | void)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
interface Reply { status: number; body: any; cookie?: string }
async function harness(options: GameApplicationOptions = {}) {
  const app = await createGameApplication('import-route-instance', 'health', { port: 0, ...options });
  cleanup.push(() => app.close()); app.configureOrigin(origin); app.setHostingStatus({ status: 'ready', publicOrigin: origin });
  function raw(path: string, credential: string, length?: number, method = 'POST') {
    let req!: ClientRequest;
    let writeErrorTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const result = new Promise<Reply>((resolve, reject) => {
      const fail = (error: Error) => { if (settled) return; settled = true; clearTimeout(writeErrorTimer); reject(error); };
      req = request({ hostname: '127.0.0.1', port: app.port, agent: false, path, method, headers: {
        Host: new URL(origin).host, Origin: origin, Cookie: credential,
        'Content-Type': 'application/json', ...(length === undefined ? {} : { 'Content-Length': length }),
      } }, response => {
        response.on('error', fail);
        response.on('aborted', () => fail(new Error('Import response was aborted.')));
        const chunks: Buffer[] = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => {
          if (settled) return; settled = true; clearTimeout(writeErrorTimer);
          const text = Buffer.concat(chunks).toString();
          resolve({ status: response.statusCode!, body: text ? JSON.parse(text) : null,
            cookie: response.headers['set-cookie']?.[0]?.split(';')[0] });
        });
      });
      req.on('error', error => {
        if (settled) return;
        // A server can send 413 and stop reading while the client still writes.
        // Allow that completed response to win, but fail if no response arrives.
        if ((error as NodeJS.ErrnoException).code === 'EPIPE') writeErrorTimer = setTimeout(() => fail(error), 100);
        else fail(error);
      });
    });
    void result.catch(() => {}); // Cleanup may abort an intentionally unfinished request.
    cleanup.push(() => { req.destroy(); });
    return { req, result };
  }
  async function http(path: string, body: unknown, credential = '', method = 'POST') {
    const bytes = body === undefined ? undefined : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const call = raw(path, credential, bytes?.length, method); call.req.end(bytes); return call.result;
  }
  async function owner() {
    const response = await http('/api/owner/exchange', { protocolVersion: 1, token: app.mintOwnerLink().split('#')[1] });
    expect(response.status).toBe(200);
    return { cookie: response.cookie!, page: response.body, sequence: 0 };
  }
  const envelope = (actor: { page: any; sequence: number }, payload = {}, gameId: string | null = null) => ({
    protocolVersion: 1, serverInstanceId: 'import-route-instance', tabId: actor.page.tabId,
    requestId: actor.page.requestPrefix + '.' + (++actor.sequence), gameId, payload,
  });
  function commitInput(actor: { page: any; sequence: number }, imported: any) {
    const { gameId: _, payload: __, ...context } = envelope(actor);
    return { ...context, candidateId: imported.candidateId, expectedGameId: imported.expectedGameId,
      expectedSetupGeneration: imported.expectedSetupGeneration };
  }
  const snapshot = (actor: { cookie: string; page: any }, gameId: string) => http('/api/snapshot?' + new URLSearchParams({
    serverInstanceId: 'import-route-instance', tabId: actor.page.tabId, gameId,
  }), undefined, actor.cookie, 'GET');
  async function game(actor: Awaited<ReturnType<typeof owner>>) {
    const uploaded = await http('/api/host/import', twoPromptPack(), actor.cookie); expect(uploaded.status).toBe(200);
    const committed = await http('/api/host/games', commitInput(actor, uploaded.body), actor.cookie);
    expect(committed.body.outcome).toBe('COMMITTED'); return committed.body.gameId as string;
  }
  async function socket(actor: { cookie: string; page: any }) {
    const socket = io('http://127.0.0.1:' + app.port, { autoConnect: false, forceNew: true, reconnection: false,
      transports: ['websocket'], extraHeaders: { Host: new URL(origin).host, Origin: origin, Cookie: actor.cookie },
      auth: { protocolVersion: 1, serverInstanceId: 'import-route-instance', tabId: actor.page.tabId } });
    cleanup.push(() => { socket.disconnect(); });
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
    return (kind: string, input: any) => new Promise<any>((resolve, reject) => socket.timeout(2000).emit(kind, input, (error: unknown, value: any) => error ? reject(error) : resolve(value)));
  }
  async function until(check: () => Promise<boolean>) {
    const limit = Date.now() + 2000;
    while (!await check()) { if (Date.now() > limit) throw Error('Server state did not change'); await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  return { app, raw, http, owner, envelope, commitInput, snapshot, game, socket, until };
}

describe('production import route boundaries', () => {
  it('rejects unauthorized import before waiting for or parsing an advertised oversized body', async () => {
    const h = await harness();
    const pending = h.raw('/api/host/import', '', 10 * 1024 ** 2 + 1);
    pending.req.flushHeaders();
    expect((await pending.result).status).toBe(401);
    pending.req.destroy();
    const owner = await h.owner();
    expect((await h.http('/api/host/import', twoPromptPack(), owner.cookie)).status).toBe(200);
  });
  it('rechecks owner after a slow upload and releases its reservation on credential rotation', async () => {
    const h = await harness(), oldOwner = await h.owner(), gameId = await h.game(oldOwner);
    const bytes = Buffer.from(JSON.stringify(twoPromptPack()));
    const slow = h.raw('/api/host/import', oldOwner.cookie, bytes.length); slow.req.write(bytes.subarray(0, 1));
    await h.until(async () => !(await h.snapshot(oldOwner, gameId)).body.canReplace);
    const recovered = await h.owner();
    slow.req.end(bytes.subarray(1));
    expect((await slow.result).status).toBe(401);
    expect((await h.http('/api/host/import', twoPromptPack(), recovered.cookie)).status).toBe(200);
    expect((await h.snapshot(recovered, gameId)).body).toMatchObject({ phase: 'Lobby', gameId });
  });
  it('preserves committed lobby after malformed, oversized, missing-body and failed-capacity imports', async () => {
    let enoughMemory = true;
    const h = await harness({ importsOptions: { capacity: () => ({ availableBytes: enoughMemory ? 2 ** 32 : 0, parentHeapBytes: 2 ** 32 }) } });
    const owner = await h.owner(), gameId = await h.game(owner);
    expect((await h.http('/api/host/import', '{', owner.cookie)).body.code).toBe('INVALID_PACK');
    const oversized = h.raw('/api/host/import', owner.cookie, 10 * 1024 ** 2 + 1);
    oversized.req.flushHeaders();
    expect((await oversized.result).status).toBe(413);
    oversized.req.destroy();
    expect((await h.http('/api/host/import', undefined, owner.cookie)).body.code).toBe('INVALID_PACK');
    enoughMemory = false;
    expect((await h.http('/api/host/import', twoPromptPack(), owner.cookie)).body.code).toBe('IMPORT_CAPACITY');
    enoughMemory = true;
    expect((await h.snapshot(owner, gameId)).body).toMatchObject({ phase: 'Lobby', gameId, canReplace: true });
    expect((await h.http('/api/host/import', twoPromptPack(), owner.cookie)).status).toBe(200);
  });
  it('blocks Start and commit while upload is reserved; Start later invalidates an uncommitted summary', async () => {
    const h = await harness(), owner = await h.owner(), gameId = await h.game(owner);
    const discovery = await h.http('/api/session', { protocolVersion: 1, page: { kind: 'fresh' } });
    const player = { cookie: discovery.cookie!, page: discovery.body, sequence: 0 };
    const playerSend = await h.socket(player), hostSend = await h.socket(owner);
    const lobby = (await h.snapshot(owner, gameId)).body;
    expect((await playerSend('game.join', h.envelope(player, { code: lobby.invitation.code, nickname: 'Ada' }))).outcome).toBe('JOINED');
    const first = await h.http('/api/host/import', twoPromptPack(), owner.cookie);
    const firstCommit = h.commitInput(owner, first.body);
    const bytes = Buffer.from(JSON.stringify(twoPromptPack())), slow = h.raw('/api/host/import', owner.cookie, bytes.length);
    slow.req.write(bytes.subarray(0, 1));
    await h.until(async () => !(await h.snapshot(owner, gameId)).body.canReplace);
    expect((await h.http('/api/host/games', firstCommit, owner.cookie)).body.code).toBe('IMPORT_IN_PROGRESS');
    expect((await hostSend('game.start', h.envelope(owner, {}, gameId))).code).toBe('IMPORT_IN_PROGRESS');
    slow.req.end(bytes.subarray(1)); const second = await slow.result; expect(second.status).toBe(200);
    expect((await hostSend('game.start', h.envelope(owner, {}, gameId))).outcome).toBe('STARTED');
    expect((await h.http('/api/host/games', h.commitInput(owner, second.body), owner.cookie)).body.code).toBe('CANDIDATE_STALE');
    expect((await h.http('/api/host/import', twoPromptPack(), owner.cookie)).body.code).toBe('WRONG_PHASE');
    expect((await h.snapshot(owner, gameId)).body.phase).toBe('Reading');
  });
});
