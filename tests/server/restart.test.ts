import { expect, it } from 'vitest';
import { request } from 'node:http';
import { createGameApplication } from '../../apps/server/src/game/application.js';
import { twoPromptPack } from '../fixtures/game.js';

it('a fresh production application at the same origin loses the old game and credentials', async () => {
  const origin = 'https://restart.example.com';
  let app = await createGameApplication('first-instance', 'first-health', { port: 0 });
  const call = (path: string, body?: unknown, cookie = '') => new Promise<{ status: number; body: any; cookie: string }>((resolve, reject) => {
    const bytes = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port: app.port, path, method: bytes === undefined ? 'GET' : 'POST', agent: false,
      headers: { Host: new URL(origin).host, Origin: origin, Cookie: cookie, ...(bytes ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) } : {}) } }, res => {
      const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(Buffer.concat(chunks).toString()), cookie: res.headers['set-cookie']?.[0]?.split(';')[0] ?? cookie }));
    }); req.on('error', reject); req.end(bytes);
  });
  try {
    app.configureOrigin(origin); app.setHostingStatus({ status: 'ready', publicOrigin: origin });
    const owner = await call('/api/owner/exchange', { protocolVersion: 1, token: app.mintOwnerLink().split('#')[1] });
    const upload = await call('/api/host/import', twoPromptPack(), owner.cookie);
    const created = await call('/api/host/games', { protocolVersion: 1, serverInstanceId: 'first-instance', tabId: owner.body.tabId,
      requestId: owner.body.requestPrefix + '.1', candidateId: upload.body.candidateId,
      expectedGameId: null, expectedSetupGeneration: upload.body.expectedSetupGeneration }, owner.cookie);
    expect(created.body.outcome).toBe('COMMITTED');
    const port = app.port;
    await app.close();
    app = await createGameApplication('second-instance', 'second-health', { port });
    app.configureOrigin(origin); app.setHostingStatus({ status: 'ready', publicOrigin: origin });
    expect((await call('/api/host/import', twoPromptPack(), owner.cookie)).status).toBe(401);
    const discovery = await call('/api/session', { protocolVersion: 1, page: { kind: 'fresh' } }, owner.cookie);
    expect(discovery.body).toMatchObject({ serverInstanceId: 'second-instance', role: 'guest', membership: null, hostGameId: null, lastGameCommit: null });
    const nextOwner = await call('/api/owner/exchange', { protocolVersion: 1, token: app.mintOwnerLink().split('#')[1] });
    const snapshot = await call('/api/snapshot?serverInstanceId=second-instance&tabId=' + nextOwner.body.tabId, undefined, nextOwner.cookie);
    expect(snapshot.body).toMatchObject({ phase: 'Setup', gameId: null, promptCount: 0 });
  } finally { await app.close(); }
});
