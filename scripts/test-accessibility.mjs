import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { once } from 'node:events';
import { buildFixtures, fixtureOutput } from '../probes/web/build.mjs';
import { launchBrowser } from '../probes/browser.mjs';
import { createController } from '../apps/server/dist/hosting/controller.js';

// Isolated, pinned dev-only tool: npm install --prefix tooling/accessibility --no-save --package-lock=false axe-core@4.11.0
const axeSource = await readFile(resolve('tooling/accessibility/node_modules/axe-core/axe.min.js'), 'utf8');
const axePackage = JSON.parse(await readFile(resolve('tooling/accessibility/node_modules/axe-core/package.json'), 'utf8'));
assert.equal(axePackage.version, '4.11.0', 'Use the pinned accessibility audit engine');
await buildFixtures();
const output = resolve('work/accessibility'); await mkdir(output, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(fixtureOutput, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(fixtureOutput + sep)) return response.writeHead(403).end();
  try { const bytes = await readFile(file); response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' }).end(bytes); }
  catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
const checks = [], errors = [], screenshots = [];
let browser, controller;
async function audit(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa','best-practice'] } }));
  const compact = items => items.map(item => ({ id: item.id, impact: item.impact, description: item.description, help: item.help, helpUrl: item.helpUrl,
    nodes: item.nodes.map(node => ({ target: node.target, failureSummary: node.failureSummary, html: node.html })) }));
  checks.push({ name, viewport: page.viewportSize(), passes: result.passes.length, violations: compact(result.violations), incomplete: compact(result.incomplete) });
}
async function screenshot(page, name) { await page.screenshot({ path: resolve(output, name), animations: 'disabled' }); screenshots.push(name); }
try {
  browser = await launchBrowser();
  // Fresh browser and independent contexts ensure no previous user's session/storage is touched.
  for (const viewport of [{ width:320,height:740 },{ width:390,height:844 },{ width:1280,height:900 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin); await page.waitForFunction(() => window.webFixture); await page.addScriptTag({ content: axeSource });
    const names = await page.evaluate(() => window.webFixture.names);
    for (const name of names) {
      await page.evaluate(name => window.webFixture.show(name), name); await page.waitForTimeout(50);
      await audit(page, name);
    }
    await page.evaluate(() => window.webFixture.show('host-answering'));
    await page.getByRole('button', { name: 'Manage players', exact: true }).click();
    await audit(page, 'manage-players-dialog');
    await page.getByRole('dialog').getByRole('button',{ name:'Remove Crew 001', exact:true }).click();
    await audit(page, 'remove-player-dialog');
    if (viewport.width === 390) await screenshot(page, 'phone-remove-dialog.png');
    await context.close();
  }
  // Sample the production DOM while each motion cue is active and after it settles.
  for (const role of ['player', 'host']) {
    const player = role === 'player';
    const viewport = player ? { width:320,height:740 } : { width:1920,height:1080 };
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${origin}/?fixture=${role}-answering`);
    await page.waitForFunction(() => window.webFixture);
    await page.addScriptTag({ content: axeSource });
    const cue = page.locator(player ? '.player-cinematic' : '.host-sonar-pulse');
    await page.evaluate(({ role, player }) => {
      const fixture = window.webFixture;
      const prior = fixture.state().view;
      const { view } = fixture.snapshot(player ? 'player-all-used' : 'host-results');
      const now = Date.now();
      fixture.changeView({
        ...view,
        revision: prior.revision + 1,
        serverNowMs: now,
        phaseDeadlineMs: now + 10000,
        ...(role === 'player' ? { ownResult: { ...view.ownResult, diveBand: 'high' } } : {}),
      });
    }, { role, player });
    await cue.waitFor();
    assert.equal(await cue.getAttribute('aria-hidden'), 'true');
    await audit(page, `${role}-motion-active`);
    await cue.waitFor({ state: 'detached' });
    await audit(page, `${role}-motion-settled`);
    await context.close();
  }

  let status = 'idle', sessionId = null;
  const manager = { snapshot: () => ({ status, sessionId, publicOrigin: status === 'ready' ? 'https://fixture.example' : null }),
    async start() { status = 'ready'; sessionId = 'fixture-session'; }, async stop() { status = 'idle'; sessionId = null; },
    get application() { return sessionId ? { hasDisposableState: () => true, mintOwnerLink: () => 'https://fixture.example/owner#fixture' } : null; } };
  controller = await createController(manager);
  const context = await browser.newContext({ viewport: { width:390,height:844 }, bypassCSP: true });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(controller.accessUrl()); await page.addScriptTag({ content: axeSource });
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Ready to host');
  await audit(page, 'launcher-idle');
  await page.locator('#start').click();
  await page.waitForFunction(() => document.querySelector('#sharing').hidden === false);
  await audit(page, 'launcher-ready');
  const statusMutations = await page.evaluate(() => new Promise(done => {
    let count = 0;
    const observer = new MutationObserver(records => { count += records.length; });
    observer.observe(document.getElementById('status'), { childList: true, characterData: true, subtree: true });
    setTimeout(() => { observer.disconnect(); done(count); }, 1200);
  }));
  assert.equal(statusMutations, 0, 'Unchanged launcher polling must not repeatedly rewrite the live readiness message');
  await screenshot(page, 'phone-launcher-ready.png');
  await page.locator('#enlarge').click(); await page.getByRole('dialog', { name: 'Scan to connect', exact: true }).waitFor(); await audit(page, 'launcher-qr-dialog');
  await page.keyboard.press('Escape');
  await page.locator('#finish').click(); await page.getByRole('dialog', { name: 'Finish this hosting session?', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cancelConfirm', 'Destructive launcher confirmation should focus Cancel');
  await audit(page, 'launcher-finish-confirmation');
  await screenshot(page, 'phone-launcher-finish-confirmation.png');
  await context.close();
  const result = { status: checks.some(c => c.violations.length) || errors.length ? 'FAIL' : 'PASS', engine: `axe-core ${axePackage.version}`, browser: browser.version(),
    checkedAt: new Date().toISOString(), checks, errors, screenshots,
    scope: 'Automated rendered-DOM WCAG A/AA and best-practice rules. Fixtures render actual components with contract-valid data; launcher manager is simulated. The audit-only launcher context bypasses CSP to inject axe; production CSP is unchanged.',
    notVerified: ['Screen-reader spoken output or VoiceOver usability', 'Physical-device Safari or native keyboard', 'Complete WCAG conformance; incomplete findings need human review'] };
  await writeFile(resolve(output, 'accessibility-report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, checks: checks.length, violations: checks.filter(c => c.violations.length).map(c => ({name:c.name, viewport:c.viewport, rules:c.violations.map(v=>v.id)})), incompleteRules: [...new Set(checks.flatMap(c=>c.incomplete.map(v=>v.id)))], errors, output }));
  assert.equal(result.status, 'PASS', 'Accessibility violations were recorded; inspect accessibility-report.json');
} finally {
  await browser?.close(); await controller?.close(); await new Promise(done => server.close(done));
}
