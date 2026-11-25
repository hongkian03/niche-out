import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { launchBrowser } from '../../browser.mjs';
import { buildAndServeMotion } from './preview.mjs';

const output = fileURLToPath(new URL('../../../work/e7-motion/captures/', import.meta.url));
const server = await buildAndServeMotion(4178);
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await launchBrowser();
const checks = [];
const errors = [];
const outside = [];
const hostFrames = [0, 75, 150, 225, 300, 375, 450, 525, 600];
const revealMs = { wide: 1400, follow: 1950 };
const diveFrames = Object.fromEntries(Object.entries(revealMs).map(([mode, duration]) => [
  mode, Array.from({ length: duration / 50 }, (_, index) => index * 50),
]));
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

async function open(width, height, options = {}) {
  const { role = 'player', reducedMotion = 'no-preference', controls = false, mockClock = false, phase = 'Answering' } = options;
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion, hasTouch: width < 500 });
  page.setDefaultTimeout(6000);
  if (mockClock) await page.clock.install();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith(origin) && !request.url().startsWith('data:')) outside.push(request.url());
  });
  const url = controls ? '/motion-preview/' : `/capture?role=${role}&phase=${phase.toLowerCase()}`;
  await page.goto(origin + url);
  await page.waitForFunction(() => Boolean(window.motionPreview?.show));
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function show(page, selection) {
  const revision = await page.locator('[data-demo-revision]').getAttribute('data-demo-revision');
  await page.evaluate(selection => window.motionPreview.show(selection), selection);
  await page.waitForFunction(revision => document.querySelector('[data-demo-revision]')?.dataset.demoRevision !== revision, revision);
  if (selection.phase) await page.locator(`[data-demo-phase="${selection.phase}"]`).waitFor();
}

async function screenshot(page, name, fullPage = false) {
  await page.screenshot({ path: resolve(output, name), fullPage });
}

async function checkFit(page) {
  const sizes = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert(sizes[0] <= sizes[1], `Horizontal overflow at width ${sizes[1]}: ${sizes[0]}`);
}

async function captureMotion(page, type, key, frames) {
  const directory = resolve(output, 'frames', key);
  await mkdir(directory, { recursive: true });
  const namePrefix = type === 'player' ? 'cinematic-' : 'motion-host-';
  const target = type === 'player' ? '.player-cinematic' : '.motion-host__sonar';
  await page.locator(target).waitFor();
  const active = await page.evaluate(namePrefix => {
    const animations = document.getAnimations().filter(animation => animation.animationName?.startsWith(namePrefix));
    animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
    window.captureAnimations = animations;
    return animations.length;
  }, namePrefix);
  assert(active > 0, `Expected animations for ${key}`);
  for (const frame of frames) {
    await page.evaluate(frame => window.captureAnimations.forEach(animation => { animation.currentTime = frame; }), frame);
    await page.screenshot({ path: resolve(directory, `${frame}.png`) });
  }
}

async function measureComparison(page) {
  return page.locator('.tier-comparison__frame').evaluateAll(frames => frames.map(frame => {
    const { top, height } = frame.getBoundingClientRect();
    const start = frame.querySelector('.tier-comparison__start').getBoundingClientRect().top;
    const craft = frame.querySelector('.player-cinematic__craft').getBoundingClientRect().top;
    const terrain = frame.querySelector('.player-cinematic__terrain').getBoundingClientRect().top;
    return {
      craft: Math.round(100 * (craft - start) / height) + 0,
      scenery: Math.round(100 * (top - terrain) / height),
    };
  }));
}

async function includes(page, text, scope = 'body') {
  assert((await page.locator(scope).innerText()).includes(text), `Missing ${JSON.stringify(text)} in ${scope}`);
}

try {
  const phone = await open(390, 844);
  await show(phone, { phase: 'Reading' });
  assert(await phone.getByRole('textbox', { name: 'Your answer' }).isDisabled());
  await includes(phone, 'Name a moon of Saturn.');
  await includes(phone, 'Answering opens in');
  await screenshot(phone, 'player-reading-390.png');
  await show(phone, { phase: 'Answering', scenario: 'low', ready: 6 });
  await screenshot(phone, 'player-answering-390.png');
  await includes(phone, '6 of 24 answers submitted');
  await includes(phone, 'Time remaining');
  const answer = phone.getByRole('textbox', { name: 'Your answer' });
  await answer.fill('Not a moon');
  await phone.getByRole('button', { name: 'Submit' }).click();
  await phone.getByText('Not on this game’s answer list. Try again.').waitFor();
  assert(await answer.isEditable());
  await answer.fill('Saturn VI');
  await phone.getByRole('button', { name: 'Submit' }).click();
  await phone.getByText('Answer accepted. Waiting for the round to finish.').waitFor();
  assert(await phone.locator('#answer').isDisabled());
  await includes(phone, 'Saturn VI', '.locked-answer');
  assert.equal(await phone.getByText('Surface Find').count(), 0);
  assert.equal(await phone.getByText('Albiorix').count(), 0);
  assert.equal(await phone.getByRole('tab', { name: 'Standings' }).count(), 0);
  await screenshot(phone, 'player-locked-390.png');
  await show(phone, { phase: 'Results' });
  await phone.locator('.player-cinematic').waitFor();
  assert.equal(await phone.locator('.player-results').isVisible(), false);
  assert.equal(await phone.getByRole('tab', { name: 'Standings' }).count(), 0);
  await phone.locator('.player-cinematic').waitFor({ state: 'detached' });
  for (const text of ['+12', 'Titan', 'Saturn VI', 'Surface Find', '60 points', 'Next round in', 'Albiorix']) await includes(phone, text);
  assert(Number(await phone.locator('.player-results .timer-ring span').textContent()) < 10);
  await checkFit(phone);
  await phone.getByRole('tab', { name: 'Answers' }).focus();
  await phone.keyboard.press('ArrowRight');
  assert.equal(await phone.getByRole('tab', { name: 'Standings' }).getAttribute('aria-selected'), 'true');
  await includes(phone, 'Mira', '#standings-panel');
  await phone.getByRole('button', { name: 'Show all 24 players' }).click();
  assert.equal(await phone.locator('#standings-panel tbody tr').count(), 24);
  await show(phone, { ready: 18 });
  assert.equal(await phone.getByRole('tab', { name: 'Standings' }).getAttribute('aria-selected'), 'true');
  await show(phone, { phase: 'Finished' });
  await includes(phone, 'Your round recap');
  await includes(phone, 'You submitted: Saturn VI');
  await phone.getByRole('button', { name: 'Show answer counts for round 2' }).click();
  await includes(phone, 'Albiorix');
  await screenshot(phone, 'player-final-recap-390.png', true);
  await phone.close();
  checks.push('Player reading, rejection/retry, neutral lock, exact alias result and grouped data, keyboard standings tabs, full standings and final recap');

  const bands = ['low', 'medium', 'high'];
  for (const mode of ['wide', 'follow']) {
    const page = await open(390, 844, { mockClock: true });
    const distances = [];
    const sceneryDistances = [];
    for (const scenario of bands) {
      await show(page, { playerMode: mode, scenario, phase: 'Answering' });
      await show(page, { phase: 'Results' });
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 100)));
      await captureMotion(page, 'player', `player-${mode}-${scenario}`, diveFrames[mode]);
      const [craftDistance, sceneryDistance] = await page.evaluate(() => {
        const measure = () => ['.player-cinematic__craft', '.player-cinematic__terrain'].map(
          selector => document.querySelector(selector).getBoundingClientRect().y,
        );
        const ended = measure();
        window.captureAnimations.forEach(animation => { animation.currentTime = 0; });
        const start = measure();
        return [ended[0] - start[0], start[1] - ended[1]];
      });
      distances.push(craftDistance);
      sceneryDistances.push(sceneryDistance);
      assert.equal(await page.locator('.player-cinematic').getAttribute('data-band'), scenario);
      assert.equal(await page.locator('.player-results').isVisible(), false);
      await page.clock.resume();
      await page.locator('.player-cinematic').waitFor({ state: 'detached' });
      await checkFit(page);
      await screenshot(page, `player-${mode}-${scenario}-results-390.png`);
    }
    for (const measured of [distances, sceneryDistances]) {
      assert(measured[0] >= 100, `Expected scene-wide travel in ${mode}: ${measured}`);
      assert(measured[0] + 60 < measured[1] && measured[1] + 60 < measured[2],
        `Expected visibly distinct tier distances in ${mode}: ${measured}`);
    }
    await page.close();
  }
  checks.push('Wide and Follow use full-screen craft descent and rising terrain, with distinct measured travel for all three sample tiers. Results and focusable tabs are hidden during travel and restored automatically');

  const desktop = await open(1280, 800, { mockClock: true });
  await show(desktop, { phase: 'Answering', scenario: 'high' });
  await show(desktop, { phase: 'Results' });
  await desktop.clock.pauseAt(new Date(await desktop.evaluate(() => Date.now() + 100)));
  await desktop.evaluate(() => document.getAnimations().filter(animation => animation.animationName?.startsWith('cinematic-')).forEach(animation => {
    animation.pause();
    animation.currentTime = 1000;
  }));
  await screenshot(desktop, 'player-wide-high-desktop.png');
  await desktop.clock.resume();
  await desktop.emulateMedia({ reducedMotion: 'reduce' });
  await desktop.locator('.player-cinematic').waitFor({ state: 'detached' });
  await desktop.emulateMedia({ reducedMotion: 'no-preference' });
  await show(desktop, { ready: 19 });
  assert.equal(await desktop.locator('.player-cinematic').count(), 0);
  await desktop.close();
  checks.push('Desktop scene uses the whole viewport. Enabling reduced motion mid-dive settles the result without replay on a same-phase update');

  for (const width of [320, 390]) {
    const page = await open(width, 680, { reducedMotion: width === 390 ? 'reduce' : 'no-preference' });
    await show(page, { scenario: 'high', phase: 'Answering' });
    await show(page, { phase: 'Results', short: width === 320 });
    await includes(page, '+72');
    assert.equal(await page.locator('.player-cinematic').count(), 0);
    await checkFit(page);
    await screenshot(page, `player-${width === 320 ? 'short' : 'reduced'}-high-${width}.png`, true);
    await show(page, { phase: 'Answering', scenario: 'zero', short: false });
    await show(page, { phase: 'Results' });
    await includes(page, 'Dione');
    await includes(page, 'Accepted answer · 0 points');
    assert.equal(await page.locator('.player-cinematic').count(), 0);
    await screenshot(page, `player-zero-${width}.png`, true);
    await show(page, { phase: 'Answering', scenario: 'miss' });
    await show(page, { phase: 'Results' });
    await includes(page, 'No accepted answer');
    await checkFit(page);
    await screenshot(page, `player-miss-${width}.png`, true);
    await page.close();
  }
  const late = await open(390, 844, { phase: 'Results' });
  await includes(late, '+72');
  assert.equal(await late.locator('.player-cinematic').count(), 0);
  await late.close();
  checks.push('Accepted zero and miss remain distinct. Positive awards bypass the dive for 0.1-second Results, reduced motion and direct entry');

  const host = await open(1920, 1080, { role: 'host' });
  await show(host, { phase: 'Reading' });
  await includes(host, 'Answers open in');
  await screenshot(host, 'host-reading-1920.png');
  await show(host, { phase: 'Answering', ready: 6 });
  await includes(host, '6 of 24 answers locked');
  await includes(host, 'Time remaining');
  await host.locator('.motion-host__readiness-track').waitFor();
  const promptBounds = await host.locator('.prompt-scroll').boundingBox();
  const timerBounds = await host.locator('.phase-strip .timer').boundingBox();
  assert.equal(await host.locator('.answer-groups').count(), 0);
  assert.equal(await host.locator('.motion-host__distribution').count(), 0);
  await host.waitForFunction(() => Number(document.querySelector('.phase-strip .timer-ring span')?.textContent) <= 25);
  await screenshot(host, 'host-answering-1920.png');
  await show(host, { ready: 18 });
  await includes(host, '18 of 24 answers locked');
  assert.deepEqual(await host.locator('.prompt-scroll').boundingBox(), promptBounds);
  assert.deepEqual(await host.locator('.phase-strip .timer').boundingBox(), timerBounds);
  await screenshot(host, 'host-ready-1920.png');
  await host.getByRole('button', { name: 'Manage players' }).click();
  await host.getByRole('dialog', { name: 'Manage players' }).waitFor();
  await screenshot(host, 'host-manage-players-1920.png');
  await host.getByRole('button', { name: 'Close Manage players' }).click();
  for (const mode of ['pulse', 'distribution']) {
    await show(host, { phase: 'Answering', ready: 18, hostMode: mode });
    await show(host, { phase: 'Results' });
    await captureMotion(host, 'host', `host-${mode}`, hostFrames);
    for (const text of ['Name a moon of Saturn.', 'Next round in', 'Answers from the crew', 'Albiorix', 'Standings']) await includes(host, text);
    assert.equal(await host.locator('.answer-groups').getByText('Mira').count(), 0);
    assert.equal(await host.locator('.motion-host__distribution').count(), mode === 'distribution' ? 1 : 0);
    if (mode === 'distribution') {
      const buckets = await host.locator('.motion-host__distribution li').allTextContents();
      assert.deepEqual(buckets, ['72 pts2 answers', '38 pts4 answers', '12 pts11 answers', '0 pts1 answer']);
    }
    await checkFit(host);
    await screenshot(host, `host-results-${mode}-1920.png`);
    if (mode === 'distribution') {
      await host.locator('.unused-answer').scrollIntoViewIfNeeded();
      await screenshot(host, 'host-unused-answer-1920.png');
    }
  }
  await show(host, { phase: 'Answering', ready: 18, hostMode: 'distribution' });
  await host.getByRole('button', { name: 'Manage players' }).click();
  await host.getByRole('button', { name: 'Remove Mira' }).click();
  await host.getByRole('button', { name: 'Remove player', exact: true }).click();
  await host.getByRole('button', { name: 'Close Manage players' }).click();
  await includes(host, '17 of 23 answers locked');
  await show(host, { phase: 'Results' });
  assert.equal(await host.locator('.motion-host__distribution li').first().textContent(), '72 pts2 answers');
  assert.equal(await host.locator('.standings').getByText('Mira').count(), 0);
  await show(host, { phase: 'Finished' });
  await includes(host, 'Round recap');
  await includes(host, 'Final standings');
  await host.close();
  checks.push('Host readiness grows without moving the prompt or timer, management opens, both reveals expose aggregate and standings, removal keeps accepted statistics');

  const large = await open(1920, 1080, { role: 'host', reducedMotion: 'reduce' });
  await show(large, { phase: 'Results', crewSize: 100 });
  await large.getByRole('button', { name: 'Show all 100 players' }).click();
  assert.equal(await large.locator('.standings tbody tr').count(), 100);
  await checkFit(large);
  await screenshot(large, 'host-100-player-1920.png');
  await show(large, { phase: 'Results', emptyResults: true });
  await includes(large, 'No accepted answers.', '.motion-host__distribution');
  await includes(large, 'No accepted answers this round.');
  await large.close();
  const narrowHost = await open(390, 844, { role: 'host' });
  await show(narrowHost, { phase: 'Results' });
  await checkFit(narrowHost);
  await narrowHost.close();
  checks.push('Host 100-player full standings, empty distribution and narrow layout remain usable');

  const lab = await open(1280, 800, { controls: true, mockClock: true });
  await lab.getByRole('heading', { name: 'Niche Out Motion Preview' }).waitFor();
  assert.equal(await lab.locator('[data-demo-phase]').count(), 0);
  await checkFit(lab);
  await screenshot(lab, 'motion-preview-controls.png');
  await lab.getByRole('link', { name: 'Compare Follow tiers' }).click();
  await lab.getByRole('heading', { name: 'Follow dive tiers' }).waitFor();
  const landed = [{ craft: 12, scenery: 31 }, { craft: 22, scenery: 60 }, { craft: 34, scenery: 92 }];
  assert.deepEqual(await measureComparison(lab), landed);
  await screenshot(lab, 'follow-tier-comparison.png', true);
  for (let attempt = 0; attempt < 2; attempt++) {
    await lab.getByRole('button', { name: 'Replay all three' }).click();
    const animations = await lab.evaluate(() => {
      const animations = document.getAnimations().filter(animation => animation.animationName === 'cinematic-descend' || animation.animationName === 'cinematic-rise');
      animations.forEach(animation => { animation.pause(); animation.currentTime = 0; });
      window.comparisonAnimations = animations;
      return animations.length;
    });
    assert.equal(animations, 12);
    assert.deepEqual(await measureComparison(lab), Array.from({ length: 3 }, () => ({ craft: 0, scenery: 0 })));
    await lab.evaluate(() => window.comparisonAnimations.forEach(animation => { animation.currentTime = 200; }));
    assert.deepEqual(await measureComparison(lab), Array.from({ length: 3 }, () => ({ craft: 0, scenery: 0 })));
    await lab.evaluate(() => window.comparisonAnimations.forEach(animation => { animation.currentTime = 1650; }));
    assert.deepEqual(await measureComparison(lab), landed);
  }
  await lab.getByRole('link', { name: 'Back to motion preview' }).click();
  await lab.getByRole('heading', { name: 'Niche Out Motion Preview' }).waitFor();
  checks.push('Follow comparison uses identical starting positions, synchronized replay and measured tier landings');
  await lab.getByRole('combobox', { name: 'View' }).selectOption('host');
  await lab.getByRole('button', { name: 'Preview host reveal' }).click();
  await lab.locator('.motion-host__sonar').waitFor();
  await lab.getByRole('combobox', { name: 'View' }).selectOption('player');
  await lab.getByRole('combobox', { name: 'Outcome' }).selectOption('medium');
  for (const [name, mode] of [['Wide dive', 'wide'], ['Follow dive', 'follow'], ['Wide dive', 'wide']]) {
    await lab.getByRole('button', { name, exact: true }).click();
    await lab.locator(`.player-cinematic[data-band=medium][data-mode=${mode}]`).waitFor();
    if (mode === 'follow') {
      await lab.clock.fastForward(1740);
      assert(await lab.locator('.player-cinematic').isVisible());
      assert.equal(await lab.locator('.player-results').isVisible(), false);
      await lab.clock.fastForward(360);
    } else {
      await lab.clock.fastForward(1500);
    }
    await lab.locator('.player-cinematic').waitFor({ state: 'detached' });
    await includes(lab, '+38');
  }
  checks.push('Follow delays movement for its lead-in and keeps the result scene visible through its landing hold');
  await lab.getByText('Advanced preview controls', { exact: true }).click();
  await lab.getByRole('checkbox', { name: '0.1s results' }).check();
  const playGame = lab.getByRole('button', { name: 'Play sample game' });
  await playGame.click();
  for (const [prompt, answer, points] of [
    ['Name a layer of Earth’s atmosphere.', 'Mesosphere', 72],
    ['Name a moon of Saturn.', 'Saturn VI', 12],
    ['Name an instrument that measures weather.', 'Barometer', 38],
  ]) {
    await lab.locator('[data-demo-phase=Reading]').waitFor();
    await includes(lab, prompt);
    await lab.clock.fastForward(3100);
    await lab.locator('[data-demo-phase=Answering]').waitFor();
    await lab.getByRole('textbox', { name: 'Your answer' }).fill(answer);
    await lab.getByRole('button', { name: 'Submit', exact: true }).click();
    await lab.getByText('Answer accepted. Waiting for the round to finish.').waitFor();
    await lab.clock.fastForward(25_100);
    await lab.locator('[data-demo-phase=Results]').waitFor();
    assert.equal(await lab.locator('.player-cinematic').count(), 0);
    await includes(lab, `+${points}`, '.result-card');
    await lab.clock.fastForward(150);
  }
  await lab.locator('[data-demo-phase=Finished]').waitFor();
  await includes(lab, '122 points', '.final-summary');
  for (const submitted of ['Mesosphere', 'Saturn VI', 'Barometer']) await includes(lab, submitted, '.round-recaps');
  await playGame.click();
  await lab.locator('[data-demo-phase=Reading]').waitFor();
  await includes(lab, 'Round 1 of 3');
  await lab.close();
  const oldLink = await open(390, 844, { controls: true });
  await oldLink.goto(origin + '/?capture=1&phase=answering');
  await oldLink.getByRole('button', { name: 'Wide dive', exact: true }).waitFor();
  await oldLink.getByRole('button', { name: 'Follow dive', exact: true }).waitFor();
  assert.equal(await oldLink.locator('[data-demo-phase]').count(), 0);
  await checkFit(oldLink);
  await oldLink.setViewportSize({ width: 320, height: 680 });
  await oldLink.emulateMedia({ reducedMotion: 'reduce' });
  await oldLink.getByRole('link', { name: 'Compare Follow tiers' }).click();
  await oldLink.getByRole('heading', { name: 'Follow dive tiers' }).waitFor();
  await oldLink.getByText('Reduced motion is on.', { exact: false }).waitFor();
  await checkFit(oldLink);
  assert.equal(await oldLink.locator('.tier-comparison__frame').count(), 3);
  await oldLink.getByRole('button', { name: 'Replay all three' }).click();
  assert.deepEqual(await measureComparison(oldLink), landed);
  assert.equal(await oldLink.locator('.tier-comparison').evaluate(panel => panel.getAnimations({ subtree: true }).length), 0);
  checks.push('320–390 px preview stays horizontally contained and reduced motion displays all three Follow landings');
  await oldLink.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(outside, []);
  checks.push('Instant replay and a timed three-round game work through final scores, recap and restart, with local assets and no browser errors');
  await writeFile(resolve(output, 'checks.json'), JSON.stringify({ checks, diveFrames, hostFrames, playerMotionMs: revealMs, hostMotionMs: 600 }, null, 2) + '\n');
  for (const check of checks) console.log(`PASS ${check}`);
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
