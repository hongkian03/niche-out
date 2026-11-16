import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { HostingManager } from '../apps/server/dist/hosting/manager.js';
import { startConnector } from '../apps/server/dist/hosting/connector.js';
import { createGameApplication } from '../apps/server/dist/game/application.js';
import { gameHostingStatus } from '../apps/server/dist/game/hosting-status.js';
import { launchBrowser } from '../probes/browser.mjs';

const manualSmoke = process.argv.includes('--manual-smoke');
const manual = process.argv.includes('--manual') || manualSmoke;
const out = new URL('../work/web-ui/', import.meta.url);
await mkdir(out, { recursive: true });
let browser, connector;
const manager = new HostingManager({
  createApplication: (id, token) => createGameApplication(id, token, { port: 0 }),
  connectorFactory: async (...args) => connector = await startConnector(...args), healthIntervalMs: 1000,
});
manager.subscribe(state => manager.application?.setHostingStatus(gameHostingStatus(state)));
async function cleanup() { await browser?.close(); await manager.stop(); }
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });
async function until(fn, timeout = 30000) { const end = Date.now() + timeout; while (!await fn()) { if (Date.now() > end) throw new Error('Timed out waiting for browser condition'); await delay(100); } }
const pack = {
  schemaVersion: 1, title: 'Deep cuts · Browser expedition',
  settings: { readingSeconds: 3, answerSeconds: manual ? 600 : 90, resultsSeconds: manual && !manualSmoke ? 25 : 8 },
  tiers: [{ id: 'rare', name: 'Deep cut', points: 100 }, { id: 'common', name: 'Familiar', points: 10 }, { id: 'zero', name: 'Accepted zero', points: 0 }],
  prompts: [
    { id: 'seasons', text: 'Name one of the four seasons.', answers: [{ text: 'Autumn', tierId: 'rare', aliases: ['Fall'] }, { text: 'Summer', tierId: 'common' }, { text: 'Winter', tierId: 'rare' }, { text: 'Spring', tierId: 'zero' }] },
    { id: 'colours', text: 'Name a colour.', answers: [{ text: 'Amber', tierId: 'rare' }, { text: 'Blue', tierId: 'common' }, { text: 'Gold', tierId: 'rare' }] },
  ],
};
const checks = [], browserErrors = [];
const mark = label => { checks.push(label); console.log('PASS:', label); };
async function shot(page, name) { await page.screenshot({ path: new URL(name + '.png', out).pathname, fullPage: true }); }
async function upload(page, value, name = 'game.json') {
  await page.locator('#game-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
}
async function join(context, url, name) {
  const page = await context.newPage(); page.on('pageerror', error => browserErrors.push(error.message));
  await page.goto(url); await page.getByLabel('Nickname', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Join game', exact: true }).click();
  await page.getByText('Waiting for the host to start', { exact: false }).waitFor(); return page;
}
async function answering(page) { await page.getByLabel('Your answer', { exact: true }).waitFor(); await until(async () => !(await page.getByLabel('Your answer', { exact: true }).isDisabled())); }
async function answer(page, text) { await answering(page); await page.getByLabel('Your answer', { exact: true }).fill(text); await page.getByRole('button', { name: 'Submit', exact: true }).click(); }

try {
  console.log('Starting the built browser game and managed temporary tunnel…');
  await manager.start(); assert.equal(manager.snapshot().status, 'ready', JSON.stringify(manager.snapshot()));
  const origin = manager.snapshot().publicOrigin;
  console.log('PUBLIC_ORIGIN=' + origin);
  browser = await launchBrowser({ headless: !manual || manualSmoke });
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const host = await hostContext.newPage(); host.on('pageerror', error => browserErrors.push(error.message));
  await host.goto(manager.application.mintOwnerLink()); await host.locator('#game-file').waitFor();
  assert.equal(new URL(host.url()).hash, '');
  await shot(host, 'host-setup');
  await upload(host, '{broken'); await host.locator('.upload-panel [role=alert]').waitFor();
  assert.equal(await host.getByRole('button', { name: 'Create lobby', exact: true }).count(), 0);
  await upload(host, pack); await host.getByRole('button', { name: 'Create lobby', exact: true }).waitFor();
  assert(!(await host.locator('.pack-summary').innerText()).includes('Autumn'));
  assert(!(await host.locator('.pack-summary').innerText()).includes('Name one'));
  if (!manual) {
    // Commit really happens, but all three identical HTTP replies are lost.
    await host.route('**/api/host/games', async route => { await route.fetch(); await route.abort('failed'); }, { times: 3 });
  }
  await host.getByRole('button', { name: 'Create lobby', exact: true }).click();
  await host.getByRole('button', { name: 'Start game', exact: true }).waitFor();
  await until(async () => !(await host.locator('.notice.pending').count()));
  const joinUrl = await host.locator('a.join-link').getAttribute('href');
  assert.equal(new URL(joinUrl).origin, origin); assert.match(new URL(joinUrl).searchParams.get('code'), /^\d{6}$/);
  assert.equal(await host.locator('.qr-code').getAttribute('src').then(x => x?.startsWith('data:image/png')), true);
  mark(manual ? 'built host import, private summary and explicit commit' : 'built host import, private summary, explicit commit and lost-response reconciliation');
  const aContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const a = await join(aContext, joinUrl, manual ? 'Auto' : 'Mina');
  const bContext = manual ? null : await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const b = bContext ? await join(bContext, joinUrl, 'Rowan') : null;
  let smokePlay = Promise.resolve(), smokeError;
  if (manual) {
    await host.bringToFront();
    console.log('MANUAL_JOIN_URL=' + joinUrl);
    console.log('Scan the host QR with a phone on cellular; join as Phone. The host will start once Phone joins.');
    await shot(host, 'manual-lobby');
    if (manualSmoke) {
      // Reproduce a human starting before the coordinator observes admission,
      // including a nickname that differs in capitalization from the guide.
      const phone = await join(await browser.newContext(), joinUrl, 'phone');
      await host.getByRole('button', { name: 'Start game', exact: true }).click();
      smokePlay = (async () => {
        await answer(phone, 'Fall');
        await phone.getByRole('heading', { name: 'Round complete', exact: true }).waitFor();
        await answer(phone, 'Amber');
      })().catch(error => { smokeError = error; });
    }
    // Inspect the rendered phase/count without waiting for a lobby-only node:
    // the host may press Start while this manual probe is waiting for admission.
    await until(() => host.evaluate(() =>
      Boolean(document.querySelector('.host-shell.phase-reading,.host-shell.phase-answering,.host-shell.phase-results,.host-shell.phase-finished')) ||
      Number(document.querySelector('.host-roster .count strong')?.textContent ?? '0') >= 2,
    ), 1200000);
  } else {
    const removed = await join(await browser.newContext(), joinUrl, 'RemoveMe');
    await host.getByRole('button', { name: 'How to play', exact: true }).click();
    await host.locator('dialog[open]').waitFor(); await host.keyboard.press('Escape');
    assert.equal(await host.evaluate(() => document.activeElement?.textContent), 'How to play');
    await host.getByRole('button', { name: 'Enlarge QR', exact: true }).click(); await host.locator('dialog[open] .qr-code').waitFor(); await host.keyboard.press('Escape');
    await host.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } }));
    await host.getByRole('button', { name: 'Copy join link', exact: true }).click(); await host.getByLabel('Join link', { exact: true }).waitFor();
    assert.equal(await host.getByLabel('Join link', { exact: true }).inputValue(), joinUrl);
    await host.getByLabel('Search players').fill('remov');
    assert.equal(await host.locator('.roster-list li').count(), 1);
    await host.getByRole('button', { name: 'Remove RemoveMe', exact: true }).click();
    assert.equal(await host.evaluate(() => document.activeElement?.textContent), 'Cancel');
    await host.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await host.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Remove RemoveMe');
    await host.getByRole('button', { name: 'Remove RemoveMe', exact: true }).click(); await host.getByRole('button', { name: 'Remove player', exact: true }).click();
    await removed.getByRole('heading', { name: 'You were removed from this game.', exact: true }).waitFor();
    await host.getByRole('button', { name: 'Clear search', exact: true }).click();
    await host.getByRole('button', { name: 'Choose another game file', exact: true }).click();
    await upload(host, { ...pack, title: 'Uncommitted replacement' });
    await host.getByRole('button', { name: 'Replace game', exact: true }).waitFor();
    await host.getByRole('button', { name: 'Back to current lobby', exact: true }).click();
    assert.equal(await host.locator('a.join-link').getAttribute('href'), joinUrl);
    assert.equal(await host.locator('.roster-list li').count(), 2);
    mark('QR/copy fallback, help focus, roster filtering, removal confirmation, replacement cancellation');
  }
  const lobbyStillOpen = await host.locator('.host-shell.phase-lobby').count();
  await shot(host, lobbyStillOpen ? 'host-lobby' : 'host-already-started'); await shot(a, lobbyStillOpen ? 'player-lobby' : 'player-already-started');
  if (b) await b.bringToFront();
  if (await host.getByRole('button', { name: 'Start game', exact: true }).count()) {
    try { await host.getByRole('button', { name: 'Start game', exact: true }).click({ timeout: 2000 }); }
    catch (error) { if (await host.locator('.host-shell.phase-lobby').count()) throw error; }
  }
  await answering(a);
  if (!manual) {
    await answering(b);
    await answer(b, 'unlisted'); await b.getByText(/Not on this game.s answer list. Try again./).waitFor();
    assert.equal(await b.getByLabel('Your answer', { exact: true }).inputValue(), 'unlisted');
    await b.getByLabel('Your answer', { exact: true }).fill('Fall'); await b.getByLabel('Your answer', { exact: true }).press('Enter');
    await b.getByText('Answer accepted. Waiting for the round to finish.', { exact: true }).waitFor();
    assert(!(await b.locator('.composer').innerText()).includes('Deep cut'));
    await a.getByLabel('Your answer', { exact: true }).fill('draft stays');
    await aContext.setOffline(true);
    await until(async () => await a.getByLabel('Your answer', { exact: true }).isDisabled());
    await aContext.setOffline(false);
    await answering(a); assert.equal(await a.getByLabel('Your answer', { exact: true }).inputValue(), 'draft stays');
    await a.reload(); await answering(a); assert.equal(await a.getByLabel('Your answer', { exact: true }).inputValue(), '');
    await shot(a, 'player-answering');
    mark('rejection/Enter, neutral lock, offline draft freeze/restore and refresh clearing');
  }
  await answer(a, 'Fall');
  await a.getByRole('heading', { name: 'Round complete', exact: true }).waitFor({ timeout: manual ? 650000 : 30000 });
  await a.getByRole('tab', { name: 'Standings', exact: true }).click();
  assert.equal(await a.getByRole('tab', { name: 'Standings', exact: true }).getAttribute('aria-selected'), 'true');
  await a.getByRole('tab', { name: 'Standings', exact: true }).press('ArrowLeft');
  assert.equal(await a.getByRole('tab', { name: 'Answers', exact: true }).getAttribute('aria-selected'), 'true');
  assert((await a.locator('.result-card').innerText()).includes('Autumn'));
  await shot(a, 'player-results'); await shot(host, 'host-results');
  await host.getByRole('button', { name: 'Manage players', exact: true }).click();
  await answering(a);
  assert.equal(await host.locator('dialog[open]').count(), 1);
  await host.keyboard.press('Escape');
  if (b) await answer(b, 'Amber');
  await answer(a, 'Amber');
  await a.getByRole('heading', { name: 'Final results', exact: true }).waitFor({ timeout: manual ? 650000 : 30000 });
  await host.getByRole('heading', { name: 'Joint winners', exact: true }).waitFor();
  const totals = await host.locator('table .total-points').allTextContents(); assert.deepEqual(totals, ['200', '200']);
  await a.getByRole('button', { name: 'Show answer counts for round 1', exact: true }).click(); await a.locator('.recap-detail .answer-groups').waitFor();
  await host.locator('.round-recaps summary').first().click(); await host.locator('.recap-body .answer-groups').waitFor();
  assert(!(await host.locator('.recap-body').first().innerText()).includes('You entered'));
  await shot(a, 'player-final'); await shot(host, 'host-final');
  mark('automatic phases, result tab keyboard navigation, two-round joint winners, private and aggregate recaps');
  if (!manual) {
    // Copy the continuation as a browser Duplicate Tab does; native-menu evidence is separate.
    const continuation = await a.evaluate(() => sessionStorage.getItem('niche.continuation.v1'));
    const copied = await aContext.newPage();
    await copied.addInitScript(value => sessionStorage.setItem('niche.continuation.v1', value), continuation);
    await copied.goto(joinUrl);
    await until(async () => await a.getByRole('button', { name: 'Take control here', exact: true }).count() || await copied.getByRole('button', { name: 'Take control here', exact: true }).count());
    const old = await a.getByRole('button', { name: 'Take control here', exact: true }).count() ? a : copied;
    const other = old === a ? copied : a;
    await old.getByRole('button', { name: 'Take control here', exact: true }).click();
    await other.getByRole('button', { name: 'Take control here', exact: true }).waitFor();
    await other.close();
    await old.goto(manager.application.mintOwnerLink());
    await old.getByRole('heading', { name: 'This browser is already playing', exact: true }).waitFor();
    await old.getByRole('link', { name: 'Continue playing', exact: true }).click();
    await old.getByRole('heading', { name: 'Final results', exact: true }).waitFor();
    if (await old.getByRole('button', { name: 'Take control here', exact: true }).count()) await old.getByRole('button', { name: 'Take control here', exact: true }).click();
    if (connector.pid && process.platform !== 'win32') {
      process.kill(connector.pid, 'SIGSTOP');
      try { await until(() => manager.snapshot().status === 'reconnecting', 20000); }
      finally { process.kill(connector.pid, 'SIGCONT'); }
      await until(() => manager.snapshot().status === 'ready', 60000);
      await until(async () => !(await host.locator('.connection-notice').count()), 60000);
    }
    mark('copied continuation takeover, role-conflict preservation and real connector interruption');
    await host.getByRole('button', { name: 'Create new game', exact: true }).click(); await upload(host, '{broken');
    await host.locator('.upload-panel [role=alert]').waitFor(); assert.equal(await host.getByRole('heading', { name: 'Joint winners', exact: true }).count(), 1);
    await upload(host, { ...pack, title: 'Next expedition' }); await host.getByRole('button', { name: 'Replace game', exact: true }).click();
    await host.getByRole('button', { name: 'Start game', exact: true }).waitFor();
    assert.notEqual(await host.locator('a.join-link').getAttribute('href'), joinUrl);
    await old.getByRole('heading', { name: 'This game is no longer available.', exact: true }).waitFor();
    mark('invalid replacement preserves final results; committed replacement closes old game');
  }
  await smokePlay; if (smokeError) throw smokeError;
  assert.deepEqual(browserErrors, []);
  const result = { status: 'PASS', manual, manualSmoke, browser: browser.version(), origin, checks, device: manual && !manualSmoke ? 'Phone evidence must be separately confirmed by the user.' : 'Desktop Chrome, phone-size viewport (not physical device evidence).' };
  await writeFile(new URL(manualSmoke ? 'manual-smoke-result.json' : manual ? 'manual-browser-result.json' : 'browser-result.json', out), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (manual && !manualSmoke) { await host.bringToFront(); console.log('MANUAL_FINISHED: Keeping the final host/player screens open for review. Ctrl-C stops the test session.'); await delay(1200000); }
} catch (error) { console.error(error); if (browser) for (const [i, context] of browser.contexts().entries()) for (const [j, page] of context.pages().entries()) { try { await shot(page, `failure-${i}-${j}`); console.error(`Page ${i}/${j}:`, (await page.locator('body').innerText()).slice(0, 6000)); } catch {} } process.exitCode = 1; }
finally { await cleanup(); }
