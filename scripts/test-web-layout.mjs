import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { once } from 'node:events';
import { buildFixtures, fixtureOutput } from '../probes/web/build.mjs';
import { launchBrowser } from '../probes/browser.mjs';

await buildFixtures();
const output = resolve('work/web-ui'); await mkdir(output, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.json': 'application/json', '.txt': 'text/plain' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(fixtureOutput, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(fixtureOutput + sep)) { response.writeHead(403).end(); return; }
  try { const bytes = await readFile(file); response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }); response.end(bytes); }
  catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
const errors = [], requests = new Set(), layout = [], screenshots = [], layoutFailures = [];
async function snapshot(page, filename) { await page.screenshot({ path: resolve(output, filename), animations: 'disabled' }); screenshots.push(filename); }
async function overflow(page, fixture, width, variant = 'normal') {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    bad: [...document.querySelectorAll('body *')].filter(el => { const rect = el.getBoundingClientRect(); return rect.width && rect.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed'; }).slice(0, 8).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })),
    timerFits: [...document.querySelectorAll('.timer-ring')].every(el => { const ring = el.getBoundingClientRect(), text = el.querySelector('span').getBoundingClientRect(); return text.left >= ring.left && text.right <= ring.right; }) }));
  layout.push({ fixture, width, variant, scroll: dimensions.scroll });
  if (dimensions.scroll > dimensions.width + 1) layoutFailures.push({ fixture, width, variant, ...dimensions });
  if (!dimensions.timerFits) layoutFailures.push({ fixture, width, variant, reason: 'Timer text exceeds its circular frame' });
}
try {
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.add(request.url()));
  await page.goto(origin); await page.waitForFunction(() => window.webFixture);
  await page.evaluate(() => document.fonts.ready);
  assert(await page.evaluate(() => document.fonts.check('16px VT323')), 'Bundled VT323 font did not load');
  const names = await page.evaluate(() => window.webFixture.names);
  const palette = await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return Object.fromEntries(['text', 'muted', 'panel', 'border', 'cyan', 'lime', 'bg'].map(name => [name, style.getPropertyValue('--' + name).trim()]));
  });
  function luminance(hex) {
    const rgb = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); }
  const contrastChecks = { panelText: contrast(palette.text, palette.panel), mutedText: contrast(palette.muted, palette.panel), primaryButton: contrast(palette.bg, palette.lime), focus: contrast(palette.cyan, palette.panel), border: contrast(palette.border, palette.panel) };
  for (const key of ['panelText', 'mutedText', 'primaryButton']) assert(contrastChecks[key] >= 4.5, key + ' has insufficient text contrast');
  for (const key of ['focus', 'border']) assert(contrastChecks[key] >= 3, key + ' has insufficient control contrast');
  for (const width of [320, 360, 390, 412, 768, 1280, 1920]) {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 });
    for (const name of names) {
      await page.evaluate(name => window.webFixture.show(name), name);
      await page.waitForTimeout(40);
      await overflow(page, name, width);
      if ((width === 320 && name === 'player-results-long') || (width === 360 && name === 'player-join') || (width === 412 && name === 'player-answering') || (width === 390 && ['player-answering', 'player-results-zero'].includes(name)) ||
        (width === 1280 && name === 'host-lobby') || (width === 1920 && name === 'host-results')) await snapshot(page, `fixture-${name}-${width}.png`);
    }
  }
  await page.setViewportSize({ width: 844, height: 390 });
  for (const name of names) {
    await page.evaluate(name => window.webFixture.show(name), name); await page.waitForTimeout(40);
    await overflow(page, name, 844, 'phone-landscape');
  }
  await page.evaluate(() => window.webFixture.show('player-answering'));
  await page.getByRole('button', { name: 'Submit', exact: true }).scrollIntoViewIfNeeded();
  await snapshot(page, 'fixture-phone-landscape-844.png');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.evaluate(() => { window.webFixture.show('player-results-long'); window.scrollTo(0, 0); });
  const resultWording = page.getByRole('region', { name: 'Your accepted answer details', exact: true });
  await resultWording.waitFor();
  const wordScroll = await resultWording.evaluate(element => ({ visible: element.clientHeight, content: element.scrollHeight }));
  assert(wordScroll.content > wordScroll.visible && wordScroll.visible <= 740 * .25 + 1, 'Long accepted wording must use a bounded scroll area');
  await resultWording.focus(); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
  assert(await resultWording.evaluate(element => element.scrollTop > 0), 'Long accepted wording must be keyboard-scrollable');
  const revealTimer = await page.locator('.timer').boundingBox();
  assert(revealTimer && revealTimer.y >= 0 && revealTimer.y + revealTimer.height <= 740, 'Extreme accepted wording pushed reveal countdown below the phone viewport');
  assert(await page.getByRole('tab', { name: 'Standings', exact: true }).evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element);
    return range.getClientRects().length === 1;
  }), 'Standings tab label should fit one line at 320px');
  await page.getByRole('tab', { name: 'Standings', exact: true }).scrollIntoViewIfNeeded();
  const longTabs = await page.getByRole('tab', { name: 'Standings', exact: true }).boundingBox();
  assert(longTabs && longTabs.y + longTabs.height <= 740, 'Result tabs must remain reachable after long wording');
  await snapshot(page, 'fixture-bounded-long-result-320.png');
  // A 1280px browser zoomed to 200% has a 640 CSS-pixel layout viewport.
  // This reflow simulation does not claim an actual browser zoom or phone keyboard check.
  await page.setViewportSize({ width: 640, height: 450 });
  for (const name of ['host-setup', 'host-lobby', 'player-long-prompt', 'player-results-long', 'player-final']) {
    await page.evaluate(name => window.webFixture.show(name), name); await page.waitForTimeout(40);
    await overflow(page, name, 640, '200-percent-equivalent-reflow');
  }
  await page.setViewportSize({ width: 390, height: 440 });
  await page.evaluate(() => window.webFixture.show('player-answering'));
  await page.getByLabel('Your answer', { exact: true }).fill('Autumn');
  await page.getByRole('button', { name: 'Submit', exact: true }).scrollIntoViewIfNeeded();
  const bounds = await page.getByRole('button', { name: 'Submit', exact: true }).boundingBox();
  assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 440, 'Submit is unreachable in short viewport');
  await snapshot(page, 'fixture-short-viewport-390.png');
  // Advance the display clock within this same phase: crossing from m:ss to
  // two digits must not shrink the timer and move the answer controls.
  const longTimer = page.locator('.timer-ring');
  const timerWidth = await longTimer.evaluate(element => element.getBoundingClientRect().width);
  const timerPhase = await page.evaluate(() => window.webFixture.state().view.phaseId);
  assert((await longTimer.textContent()).includes(':'), 'Timer fixture must begin above one minute');
  try {
    await page.evaluate(() => {
      window.__layoutOriginalNow = Date.now;
      const atFiftyEightSeconds = window.webFixture.state().view.phaseDeadlineMs - 58000;
      Date.now = () => atFiftyEightSeconds;
    });
    await page.waitForFunction(() => document.querySelector('.timer-ring span')?.textContent === '58');
    assert.equal(await longTimer.evaluate(element => element.getBoundingClientRect().width), timerWidth, 'Countdown crossing one minute changed its ring width');
    assert.equal(await page.evaluate(() => window.webFixture.state().view.phaseId), timerPhase, 'Timer-width test unexpectedly changed phases');
  } finally {
    await page.evaluate(() => { Date.now = window.__layoutOriginalNow; delete window.__layoutOriginalNow; });
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  // Drive the actual Player component with contract-validated snapshots. This is
  // a fixture-only client, so these checks exercise browser interactions without
  // claiming transport or real-device IME coverage.
  await page.evaluate(() => {
    window.webFixture.show('player-reading');
    const view = window.webFixture.state().view;
    window.webFixture.changeView({ ...view, prompt: 'Keep this prompt scroll position. '.repeat(90) });
    window.webFixture.clearSubmittedAnswers();
  });
  const answer = page.getByLabel('Your answer', { exact: true });
  await answer.waitFor();
  assert(await answer.isDisabled(), 'Reading must not permit answer entry');
  const promptScroll = page.getByRole('region', { name: 'Current prompt', exact: true });
  const readScrollTop = await promptScroll.evaluate(element => { element.scrollTop = 180; return element.scrollTop; });
  assert(readScrollTop > 100, 'Long prompt fixture did not produce a scrollable region');
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const view = window.webFixture.state().view;
    window.webFixture.changeView({ ...view, phase: 'Answering', phaseId: 'interactive-answering', revision: view.revision + 1 });
  });
  await page.waitForFunction(() => document.activeElement?.id === 'answer');
  assert.equal(await promptScroll.evaluate(element => element.scrollTop), readScrollTop, 'Reading → Answering reset the same prompt scroll position');
  await answer.fill('Fall');
  assert.deepEqual(await page.evaluate(() => window.webFixture.submittedAnswers()), [], 'Typing alone submitted an answer');
  await answer.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'Fall' })));
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.webFixture.submittedAnswers()), [], 'Enter submitted while composing text');
  await answer.evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'Fall' })));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.webFixture.submittedAnswers().length === 1);
  assert.deepEqual(await page.evaluate(() => window.webFixture.submittedAnswers()), ['Fall'], 'Ordinary Enter did not submit exactly once');
  assert.equal(await answer.inputValue(), 'Fall');
  assert(await answer.evaluate(element => element.readOnly), 'Checking did not freeze the submitted wording');
  await page.keyboard.press('Enter');
  assert.deepEqual(await page.evaluate(() => window.webFixture.submittedAnswers()), ['Fall'], 'Repeated Enter duplicated a pending submission');
  await page.evaluate(() => window.webFixture.patch({ pending: null,
    answerFeedback: { roundId: 'round-1', status: 'rejected', submittedText: 'Fall', message: 'Not on this game’s answer list. Try again.' } }));
  await page.waitForFunction(() => { const field = document.getElementById('answer'); return field && !field.readOnly && document.activeElement === field; });
  assert.equal(await answer.inputValue(), 'Fall', 'Rejection discarded the editable wording');
  await answer.fill('Winter');
  assert.deepEqual(await page.evaluate(() => window.webFixture.submittedAnswers()), ['Fall'], 'Editing a rejected answer submitted it automatically');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page.waitForFunction(() => window.webFixture.submittedAnswers().length === 2);
  assert.deepEqual(await page.evaluate(() => window.webFixture.submittedAnswers()), ['Fall', 'Winter']);
  await answer.focus();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'answer', 'Acceptance blur fixture must start with a focused answer field');
  await page.evaluate(() => {
    const view = window.webFixture.state().view;
    window.webFixture.changeView({ ...view, revision: view.revision + 1, ownAnswer: { locked: true, submittedText: 'Winter' }, readiness: { accepted: 1, eligible: 100 } });
    window.webFixture.patch({ pending: null, answerFeedback: { roundId: 'round-1', status: 'accepted', submittedText: 'Winter' } });
  });
  await page.getByText('Answer accepted. Waiting for the round to finish.', { exact: true }).waitFor();
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'answer', 'Acceptance did not dismiss the focused answer field');
  assert.equal(await page.locator('.locked-answer').textContent(), 'Winter', 'Accepted wording is not readable as locked text');

  await page.evaluate(() => window.webFixture.show('player-results-zero'));
  const answersTab = page.getByRole('tab', { name: 'Answers', exact: true });
  const standingsTab = page.getByRole('tab', { name: 'Standings', exact: true });
  await answersTab.waitFor();
  assert.equal(await answersTab.getAttribute('aria-selected'), 'true', 'A new result phase did not start on Answers');
  await answersTab.focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await standingsTab.getAttribute('aria-selected'), 'true', 'ArrowRight did not select Standings');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'standings-tab');
  await page.evaluate(() => {
    const view = window.webFixture.state().view;
    window.webFixture.changeView({ ...view, revision: view.revision + 1, serverNowMs: Date.now(), results: { ...view.results, groups: [] } });
  });
  assert.equal(await standingsTab.getAttribute('aria-selected'), 'true', 'Same-phase snapshot reset the selected results tab');
  await page.keyboard.press('Home');
  assert.equal(await answersTab.getAttribute('aria-selected'), 'true', 'Home did not select Answers');
  await page.keyboard.press('End');
  assert.equal(await standingsTab.getAttribute('aria-selected'), 'true', 'End did not select Standings');
  await page.evaluate(() => {
    const view = window.webFixture.state().view;
    window.webFixture.changeView({ ...view, revision: view.revision + 1, phaseId: 'results-round-2', roundId: 'round-2', roundIndex: 1, promptCount: 2 });
  });
  await page.waitForFunction(() => document.getElementById('answers-tab')?.getAttribute('aria-selected') === 'true');
  assert.equal(await standingsTab.getAttribute('aria-selected'), 'false', 'A new round inherited the preceding results tab');

  await writeFile(resolve(output, 'layout-partial.json'), JSON.stringify({ layout, layoutFailures, screenshots }, null, 2));
  await page.evaluate(() => window.webFixture.show('host-answering'));
  await page.getByRole('button', { name: 'Manage players', exact: true }).click();
  const manage = page.getByRole('dialog', { name: 'Manage players', exact: true });
  await manage.getByRole('button', { name: 'Remove Crew 001', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Remove Crew 001 from this game?', exact: true });
  await confirm.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cancel', 'Removal must initially focus Cancel');
  for (let index = 0; index < 6; index++) {
    await page.keyboard.press('Tab');
    assert(await confirm.evaluate(dialog => dialog.contains(document.activeElement)), 'Focus escaped removal dialog after Tab ' + (index + 1) + ': ' + await page.evaluate(() => JSON.stringify({ tag: document.activeElement?.tagName, id: document.activeElement?.id, label: document.activeElement?.getAttribute('aria-label'), hasFocus: document.hasFocus() })));
  }
  await page.keyboard.press('Escape');
  await confirm.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Remove Crew 001', 'Cancel should restore the stable roster control');
  await manage.getByRole('button', { name: 'Remove Crew 001', exact: true }).click();
  await confirm.getByRole('button', { name: 'Remove player', exact: true }).click();
  await confirm.getByRole('button', { name: 'Close', exact: true }).click();
  await confirm.waitFor({ state: 'detached' });
  assert(await manage.evaluate(dialog => dialog.contains(document.activeElement)), 'Closing pending confirmation must retain usable focus inside Manage players');
  assert(await manage.getByText('Confirming game… Closing this panel does not cancel the request.').isVisible(), 'Pending operation status disappeared after confirmation dismissal');
  await page.keyboard.press('Escape');
  await manage.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Manage players');

  await page.evaluate(() => window.webFixture.show('dialog'));
  await page.getByRole('button', { name: 'Open fixture dialog', exact: true }).click();
  await page.evaluate(() => window.webFixture.nextModalPhase());
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Current phase heading', 'Removed opener must restore focus to current phase heading');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.webFixture.show('player-answering')); await page.waitForTimeout(40);
  assert(await page.evaluate(() => [...document.querySelectorAll('.bubble,.submarine')].every(el => getComputedStyle(el).animationName === 'none')), 'Reduced motion leaves scenery animating');
  await snapshot(page, 'fixture-reduced-motion.png');
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await phoneContext.newPage(); await phone.goto(origin); await phone.waitForFunction(() => window.webFixture);
  await phone.evaluate(() => window.webFixture.show('player-reading'));
  await phone.getByLabel('Your answer', { exact: true }).waitFor();
  await phone.evaluate(() => {
    const view = window.webFixture.state().view;
    window.webFixture.changeView({ ...view, phase: 'Answering', phaseId: 'touch-answering', revision: view.revision + 1 });
  });
  await phone.waitForTimeout(50);
  assert.notEqual(await phone.evaluate(() => document.activeElement?.id), 'answer', 'Touch device answer phase must not force input focus');
  await phone.getByLabel('Your answer', { exact: true }).tap();
  assert.equal(await phone.evaluate(() => document.activeElement?.id), 'answer', 'Touch input should focus after deliberate tap');
  await phone.getByLabel('Your answer', { exact: true }).fill('draft');
  await phone.evaluate(() => window.webFixture.patch({ status: 'reconnecting' }));
  assert.equal(await phone.getByLabel('Your answer', { exact: true }).inputValue(), 'draft', 'Reconnecting discarded same-document draft');
  assert(await phone.getByLabel('Your answer', { exact: true }).isDisabled(), 'Disconnected answer remained editable');
  assert(await phone.getByRole('button', { name: 'Submit', exact: true }).isDisabled(), 'Disconnected Submit remained available');
  await phoneContext.close();
  assert.deepEqual(errors, [], 'Browser fixture errors');
  assert([...requests].every(url => url.startsWith(origin) || url.startsWith('data:')), 'A fixture requested a nonlocal asset');
  const result = { status: layoutFailures.length ? 'FAIL' : 'PASS', browser: browser.version(), layoutChecks: layout.length, layout, layoutFailures, contrastChecks, screenshots,
    checks: ['role fixtures', 'long content and safe integer scores', 'bounded keyboard-scrollable personal result wording preserves reveal countdown', '100-player roster', 'local font and assets', 'seven portrait/desktop widths plus phone landscape', '200% equivalent reflow (not browser zoom)', 'short viewport manual-scroll reachability', 'stable timer ring width when crossing one minute within a phase', 'desktop answer-phase focus and same-prompt scroll preservation', 'explicit Enter and modeled composition guard', 'pending duplicate prevention and rejection wording/focus preservation', 'accepted wording and focus dismissal', 'result tab keyboard navigation and phase-aware reset', 'nested dialog focus containment and Cancel', 'pending removal dismissal', 'phase-change focus fallback', 'reduced motion', 'touch-emulated focus requires tap', 'same-document disconnected draft preserved and editing/submission disabled'],
    notVerified: ['actual mobile keyboard and operating-system IME', 'real device zoom and assistive technology', 'network/production protocol (separate test-browser-game)'] };
  await writeFile(resolve(output, 'layout-report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, layout: undefined }));
  assert.equal(layoutFailures.length, 0, 'Horizontal overflow occurred in the recorded fixture cases');
} finally {
  await browser?.close(); await new Promise(resolveClose => server.close(resolveClose));
}
