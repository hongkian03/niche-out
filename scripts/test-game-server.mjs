import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { HostingManager } from '../apps/server/dist/hosting/manager.js';
import { startConnector } from '../apps/server/dist/hosting/connector.js';
import { createGameApplication } from '../apps/server/dist/game/application.js';
import { gameHostingStatus } from '../apps/server/dist/game/hosting-status.js';
import { launchBrowser } from '../probes/browser.mjs';
import { completeView, socketAcknowledgements, httpRoutes } from '@rarity/contracts';

const manual = process.argv.includes('--manual');
const assets = new Map([
  ['/protocol-check', { bytes: await readFile(new URL('../probes/game/index.html', import.meta.url)), type: 'text/html; charset=utf-8' }],
  ['/protocol-check.js', { bytes: await readFile(new URL('../probes/game/client.js', import.meta.url)), type: 'text/javascript' }],
  ['/client.js', { bytes: await readFile(resolve(dirname(createRequire(import.meta.url).resolve('socket.io')), '../client-dist/socket.io.js')), type: 'text/javascript' }],
]);
let connector, browser;
const manager = new HostingManager({
  createApplication: (id, token) => createGameApplication(id, token, { port: 0, diagnosticAssets: assets }),
  connectorFactory: async (...args) => connector = await startConnector(...args), healthIntervalMs: 1000,
});
manager.subscribe(state => { manager.application?.setHostingStatus(gameHostingStatus(state)); });
async function cleanup() { await browser?.close(); await manager.stop(); }
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
async function waitFor(fn, timeout = 30000) { const end = Date.now() + timeout; while (!await fn()) { if (Date.now() >= end) throw new Error('Wait timed out'); await delay(100); } }
const pack = {
  schemaVersion: 1, title: 'Production protocol game',
  settings: { readingSeconds: 1, answerSeconds: manual ? 180 : 30, resultsSeconds: manual ? 6 : 1 },
  tiers: [{ id: 'rare', name: 'Rare', points: 100 }, { id: 'common', name: 'Common', points: 10 }],
  prompts: [
    { id: 'seasons', text: 'Name a season. For this check, submit Fall.', answers: [
      { text: 'Autumn', tierId: 'rare', aliases: ['Fall'] }, { text: 'Summer', tierId: 'common' }, { text: 'Winter', tierId: 'rare' },
    ] },
    { id: 'colours', text: 'Name a colour. For this check, submit Amber.', answers: [
      { text: 'Amber', tierId: 'rare' }, { text: 'Blue', tierId: 'common' },
    ] },
  ],
};
async function openClient(context, origin) {
  const page = await context.newPage(); await page.goto(origin + '/protocol-check'); await page.evaluate(() => window.protocolReady); return page;
}
async function command(page, name, payload = {}, extra = {}) {
  const result = await page.evaluate(({ name, payload, extra }) => window.protocolState.command(name, payload, extra), { name, payload, extra });
  socketAcknowledgements[name].parse(result); return result;
}
async function view(page) { const result = await command(page, 'state.get'); assert.equal(result.outcome, 'STATE', JSON.stringify(result)); return completeView.parse(result.view); }
async function http(page, path, body, raw = false) {
  return page.evaluate(async ({ path, body, raw }) => {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' }, body: raw ? body : JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cache: response.headers.get('cache-control') };
  }, { path, body, raw });
}
try {
  console.log('Starting production server and managed temporary tunnel…');
  await manager.start(); assert.equal(manager.snapshot().status, 'ready', JSON.stringify(manager.snapshot()));
  const origin = manager.snapshot().publicOrigin;
  console.log('Public production origin:', origin);
  browser = await launchBrowser({ headless: !manual });
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await ownerPage.goto(manager.application.mintOwnerLink());
  await ownerPage.waitForFunction(() => Boolean(document.querySelector('.host-shell')));
  assert.equal(new URL(ownerPage.url()).hash, '');
  const host = await openClient(ownerContext, origin);
  const oversized = await http(host, '/api/host/import', ' '.repeat(10 * 1024 * 1024 + 1), true);
  assert.equal(oversized.status, 413);
  const malformed = await http(host, '/api/host/import', '{broken', true); assert.equal(malformed.status, 422);
  const exact = await http(host, '/api/host/import', JSON.stringify(pack).padEnd(10 * 1024 * 1024), true); assert.equal(exact.status, 200, JSON.stringify(exact.body));
  const imported = await http(host, '/api/host/import', JSON.stringify(pack), true);
  assert.equal(imported.status, 200, JSON.stringify(imported.body)); httpRoutes['POST /api/host/import'].success.parse(imported.body);
  assert(!JSON.stringify(imported.body).includes('Autumn'));
  const commit = await host.evaluate(candidate => {
    const s = window.protocolState; return { protocolVersion: 2, serverInstanceId: s.discovery.serverInstanceId, tabId: s.discovery.tabId,
      requestId: s.nextRequestId(), candidateId: candidate.candidateId, expectedGameId: candidate.expectedGameId, expectedSetupGeneration: candidate.expectedSetupGeneration };
  }, imported.body);
  await host.route('**/api/host/games', async route => { const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed'); }, { times: 1 });
  await assert.rejects(http(host, '/api/host/games', commit)); // Server committed; browser never receives its response.
  const lobby = await view(host); assert.equal(lobby.phase, 'Lobby');
  const playerContexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const players = await Promise.all(playerContexts.map(context => openClient(context, origin)));
  for (const [index, page] of players.entries()) {
    assert.equal((await command(page, 'game.join', { code: lobby.invitation.code, nickname: ['Auto', 'Removed'][index] })).outcome, 'JOINED');
  }
  // Treat the original commit response as lost and retry after players have joined.
  const replay = await http(host, '/api/host/games', commit); assert.equal(replay.body.outcome, 'COMMITTED'); assert.equal(replay.body.gameId, lobby.gameId);
  assert.equal((await view(host)).roster.length, 2);
  const resolveReply = await http(host, '/api/host/operations/resolve', { protocolVersion: 2, operation: { kind: 'game.commit', original: commit } });
  assert.equal(resolveReply.body.outcome, 'APPLIED');
  if (manual) {
    console.log('MANUAL_JOIN_URL=' + origin + '/protocol-check?code=' + lobby.invitation.code);
    console.log('On a phone using cellular: join as Phone, then answer Fall and Amber.');
    await waitFor(async () => (await view(host)).roster.length >= 3, 600000);
  } else {
    const context = await browser.newContext(); const page = await openClient(context, origin); players.push(page);
    assert.equal((await command(page, 'game.join', { code: lobby.invitation.code, nickname: 'Second' })).outcome, 'JOINED');
  }
  // Rotate owner credentials without changing the game or committed operation.
  const recoveredContext = await browser.newContext(); const recoveryPage = await recoveredContext.newPage();
  await recoveryPage.goto(manager.application.mintOwnerLink()); await recoveryPage.waitForFunction(() => Boolean(document.querySelector('.host-shell')));
  const recoveredHost = await openClient(recoveredContext, origin);
  assert.equal((await view(recoveredHost)).gameId, lobby.gameId);
  assert.equal((await ownerContext.request.get(origin + '/api/snapshot?serverInstanceId=' + lobby.serverInstanceId + '&gameId=' + lobby.gameId + '&tabId=' + commit.tabId)).status(), 401);
  const removedId = (await view(players[1])).ownPlayer.playerId;
  assert.equal((await command(recoveredHost, 'player.remove', { targetPlayerId: removedId })).outcome, 'REMOVED');
  assert.equal((await command(recoveredHost, 'game.start')).outcome, 'STARTED');
  for (const [roundIndex, text] of ['Fall', 'Amber'].entries()) {
    await waitFor(async () => { const v = await view(recoveredHost); return v.phase === 'Answering' && v.roundIndex === roundIndex; }, manual ? 240000 : 30000);
    let current = await view(players[0]);
    if (!roundIndex) {
      const rejected = await command(players[0], 'answer.submit', { text: 'unlisted' }, { roundId: current.roundId, controlGeneration: current.controlGeneration });
      assert.equal(rejected.outcome, 'REJECTED');
    }
    for (const page of manual ? [players[0]] : [players[0], players[2]]) {
      current = await view(page);
      assert.equal((await command(page, 'answer.submit', { text }, { roundId: current.roundId, controlGeneration: current.controlGeneration })).outcome, 'ACCEPTED');
    }
    await waitFor(async () => (await view(recoveredHost)).phase === 'Results', manual ? 240000 : 30000);
    const results = await view(recoveredHost); assert.equal(results.results.groups[0].count, 2);
  }
  await waitFor(async () => (await view(recoveredHost)).phase === 'Finished');
  const final = await view(recoveredHost);
  const playerFinal = await view(players[0]);
  const viewBytes = { hostFinished: Buffer.byteLength(JSON.stringify(final)), playerFinished: Buffer.byteLength(JSON.stringify(playerFinal)) };
  for (let index = 0; index < 3; index++) { const sample = await command(recoveredHost, 'clock.sample', { sampleId: 'sample-' + index }); assert.equal(sample.sampleId, 'sample-' + index); assert(Number.isFinite(sample.serverNowMs)); }
  assert.deepEqual(final.standings.map(row => row.publishedTotal), [200, 200]);
  assert.deepEqual(final.standings.map(row => row.rank), [1, 1]);
  // Ordinary fresh page takes control; the original page cannot reclaim by reconnecting.
  const newer = await openClient(playerContexts[0], origin);
  await players[0].waitForFunction(() => window.protocolState.superseded === true);
  assert.equal((await command(players[0], 'player.claimControl', { explicit: true })).outcome, 'CONTROL_GRANTED');
  await newer.waitForFunction(() => window.protocolState.superseded === true);
  if (connector.pid && process.platform !== 'win32') {
    process.kill(connector.pid, 'SIGSTOP');
    try { await waitFor(() => manager.snapshot().status === 'reconnecting', 20000); }
    finally { process.kill(connector.pid, 'SIGCONT'); }
    await waitFor(() => manager.snapshot().status === 'ready', 30000);
    await waitFor(async () => { try { return (await view(recoveredHost)).phase === 'Finished'; } catch { return false; } });
  }
  const outsider = await browser.newContext();
  assert.equal((await outsider.request.post(origin + '/api/host/games', { headers: { Origin: origin }, data: commit })).status(), 401);
  assert.equal((await outsider.request.get(origin + '/docs/game.example.json')).status(), 404);
  const health = await outsider.request.get(origin + '/health'); httpRoutes['GET /health'].success.parse(await health.json());
  assert(health.headers()['cache-control'].includes('no-store'));
  console.log(JSON.stringify({ status: 'PASS', manual, provider: 'Cloudflare Quick Tunnel', origin, browser: browser.version(), viewBytes, winners: final.standings.map(row => row.nickname), checks: ['built shell owner exchange','worker import','lost commit response replay','operation resolution','private views','owner rotation','removal','two-round scoring','new-tab takeover','connector interruption/recovery','public authority and asset isolation'] }));
  if (manual) { await players[0].bringToFront(); console.log('MANUAL_DUPLICATE_READY: In the visible Auto player tab, use Chrome Duplicate Tab. Original should become superseded; Take control here should reverse control. Holding for 10 minutes; Ctrl-C cleans up.'); await delay(600000); }
} finally { await cleanup(); }
