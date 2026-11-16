// Runs the extracted package with its own Node/dependencies; only the browser driver
// lives in the development workspace. Private access links travel over IPC only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from '../probes/browser.mjs';

const root = resolve(process.argv[2] ?? 'dist-release/Niche-Out-0.1.0-private-darwin-arm64');
const entry = pathToFileURL(join(root, 'apps/server/dist/hosting/launch.js')).href;
const runtime = join(root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node');
const child = spawn(runtime, ['-e', `(async () => {
  const { launchHosting } = await import(${JSON.stringify(entry)});
  const app = await launchHosting({ interactive: false, openBrowser: url => process.send({ privateUrl: url }) });
  process.on('message', async message => { if (message === 'stop') { await app.shutdown(); process.disconnect(); } });
  process.channel.unref();
})().catch(error => { console.error(error.message); process.exitCode = 1; });
`], { cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } });
let browser;
const logs = [];
child.stdout.on('data', b => logs.push(b.toString()));
child.stderr.on('data', b => logs.push(b.toString()));
const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
const until = async (fn, ms = 30000) => { const end = Date.now() + ms; while (!await fn()) { if (Date.now() > end) throw new Error('Portable smoke timed out'); await delay(100); } };
const checks = [];
try {
  const privateUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Package did not open setup: ' + logs.join(''))), 30000);
    child.once('message', message => { clearTimeout(timer); resolve(message.privateUrl); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Package exited before setup: ' + logs.join(''))); });
  });
  browser = await launchBrowser();
  const hostContext = await browser.newContext();
  const dashboard = await hostContext.newPage();
  await dashboard.goto(privateUrl);
  await dashboard.locator('#start').click();
  await dashboard.waitForFunction(() => document.querySelector('#status').textContent === 'Your session is ready', null, { timeout: 210000 });
  checks.push('bundled runtime, native adapter, assets, real tunnel and public readiness');
  const popup = hostContext.waitForEvent('page');
  await dashboard.locator('#owner').click();
  const host = await popup;
  await host.locator('#game-file').waitFor({ timeout: 30000 });
  const pack = { schemaVersion: 1, title: 'Portable package smoke', settings: { readingSeconds: 0.2, answerSeconds: 30, resultsSeconds: 0.3 }, tiers: [{ id: 'rare', name: 'Rare', points: 100 }], prompts: [
    { id: 'season', text: 'Name a season.', answers: [{ text: 'Autumn', aliases: ['Fall'], tierId: 'rare' }] },
    { id: 'colour', text: 'Name a colour.', answers: [{ text: 'Amber', tierId: 'rare' }] },
  ] };
  await host.locator('#game-file').setInputFiles({ name: 'smoke.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await host.getByRole('button', { name: 'Create lobby', exact: true }).click();
  await host.getByRole('button', { name: 'Start game', exact: true }).waitFor();
  const joinUrl = await host.locator('a.join-link').getAttribute('href');
  const players = await browser.newContext();
  const player = await players.newPage();
  await player.goto(joinUrl);
  await player.getByLabel('Nickname', { exact: true }).fill('Package player');
  await player.getByRole('button', { name: 'Join game', exact: true }).click();
  await player.getByText('Waiting for the host to start', { exact: false }).waitFor();
  await host.getByRole('button', { name: 'Start game', exact: true }).click();
  for (const [round, answer] of ['Fall', 'Amber'].entries()) {
    await player.getByText(`Round ${round + 1} of 2`, { exact: true }).waitFor();
    const field = player.getByLabel('Your answer', { exact: true });
    await field.waitFor();
    await until(async () => await field.isEnabled());
    await field.fill(answer);
    await player.getByRole('button', { name: 'Submit', exact: true }).click();
  }
  await player.locator('.player-finished').waitFor();
  assert.match(await player.locator('.player-finished').innerText(), /200/);
  checks.push('real browser join, worker import, two-round play and 200-point final');
  await host.close();
  assert.equal(child.exitCode, null);
  const recoveredPopup = hostContext.waitForEvent('page');
  await dashboard.locator('#owner').click();
  const recovered = await recoveredPopup;
  await recovered.locator('.host-shell.phase-finished').waitFor();
  checks.push('browser-close survival and private owner recovery with final results');
  await dashboard.locator('#quit').click();
  await dashboard.locator('#confirmAction').click();
  await until(async () => child.exitCode !== null);
  assert.equal((await exited).code, 0);
  checks.push('explicit quit stops packaged launcher');
  console.log(JSON.stringify({ status: 'PASS', package: root, checks }, null, 2));
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    if (child.connected) child.send('stop');
    await Promise.race([exited, delay(5000)]);
    if (child.exitCode === null) child.kill('SIGTERM');
  }
}
