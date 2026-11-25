import assert from 'node:assert/strict';

export async function verifyFollowDive(page, origin) {
  await page.clock.install();
  await page.goto(origin + '/?fixture=player-answering');
  await page.bringToFront();

  const scene = page.locator('.player-cinematic[data-mode="follow"]');
  const panels = page.locator('.player-results');
  const heading = page.getByRole('heading', { name: 'Round complete', exact: true });
  const answer = page.getByLabel('Your answer', { exact: true });
  const answers = page.getByRole('tab', { name: 'Answers', exact: true });
  const standings = page.getByRole('tab', { name: 'Standings', exact: true });
  let round = 0;

  async function startAnswering() {
    await page.evaluate(round => {
      const fixture = window.webFixture;
      const next = fixture.snapshot('player-answering');
      const roundId = 'follow-fixture-round-' + round;
      fixture.patch({ ...next, view: { ...next.view, roundId, phaseId: roundId + '-answering' } });
    }, ++round);
    await answer.waitFor();
    await page.waitForFunction(() => !document.querySelector('#answer')?.disabled);
  }

  async function publishResults({ fixtureName = 'player-all-used', band, remainingMs = 10_000 } = {}) {
    await page.evaluate(({ fixtureName, band, remainingMs }) => {
      const fixture = window.webFixture;
      const { view: prior } = fixture.state();
      const { view: results } = fixture.snapshot(fixtureName);
      const now = Date.now();
      fixture.changeView({
        ...results,
        ownResult: band ? { ...results.ownResult, diveBand: band } : results.ownResult,
        roundId: prior.roundId,
        phaseId: prior.roundId + '-results',
        revision: prior.revision + 1,
        serverNowMs: now,
        phaseDeadlineMs: now + remainingMs,
      });
    }, { fixtureName, band, remainingMs });
  }

  async function staticResults(expected) {
    await heading.waitFor();
    assert.equal(await scene.count(), 0, 'An ineligible result opened the dive scene');
    assert(await standings.isVisible(), 'The static result must expose standings');
    assert((await panels.innerText()).includes(expected));
  }

  function near(actual, expected, label) {
    assert(Math.abs(actual - expected) <= 0.25, `${label}: expected ${expected}%, got ${actual}%`);
  }

  for (const [band, craft, terrain] of [['low', 12, 31], ['medium', 22, 60], ['high', 34, 92]]) {
    await startAnswering();
    await answer.focus();
    await publishResults({ band });
    await scene.waitFor();
    assert.equal(await scene.getAttribute('data-band'), band);
    assert.equal(await page.locator('.app-player[data-follow-dive][inert]').count(), 1, 'The dive must keep underlying controls inert');
    assert.equal(await scene.getAttribute('aria-hidden'), 'true', 'The animation must be decorative');
    assert.equal(await standings.count(), 0, 'Results tabs should stay out of keyboard navigation during motion');
    assert.equal(await heading.count(), 0, 'Results heading was exposed while the dive was playing');
    assert.equal(await page.getByRole('main').count(), 1, 'The dive keeps one accessible main landmark');
    await page.getByRole('heading', { name: 'Revealing your score', exact: true }).waitFor();

    const motion = await scene.evaluate(node => {
      const craft = node.querySelector('.player-cinematic__craft');
      const terrain = node.querySelector('.player-cinematic__terrain');
      const award = node.querySelector('.player-cinematic__award');
      const animations = node.getAnimations({ subtree: true });
      animations.forEach(animation => animation.pause());
      const pose = time => {
        animations.forEach(animation => { animation.currentTime = time; });
        return {
          craft: craft.getBoundingClientRect().top,
          terrain: terrain.getBoundingClientRect().top,
          awardOpacity: Number(getComputedStyle(award).opacity),
        };
      };
      return {
        height: node.getBoundingClientRect().height,
        opening: pose(0),
        pause: pose(200),
        travel: pose(750),
        landing: pose(1650),
        hold: pose(1800),
        award: award.textContent,
      };
    });
    assert.deepEqual(motion.pause, motion.opening, band + ' moved during the opening hold');
    assert(motion.travel.craft > motion.opening.craft && motion.travel.terrain < motion.opening.terrain, band + ' did not descend during travel');
    near((motion.landing.craft - motion.opening.craft) * 100 / motion.height, craft, band + ' craft drop');
    near((motion.opening.terrain - motion.landing.terrain) * 100 / motion.height, terrain, band + ' scenery rise');
    assert.deepEqual(motion.hold, motion.landing, band + ' did not hold the final frame');
    assert.equal(motion.landing.awardOpacity, 1);
    assert.match(motion.award, /\+100/);
    assert.match(motion.award, /Rare/);
    await page.clock.fastForward(2000);
    await staticResults('Autumn');
    await page.waitForFunction(() => document.activeElement?.id === 'results-heading');
    assert((await panels.innerText()).includes('You submitted: Fall'));
    const seconds = Number(await panels.locator('.timer-ring span').textContent());
    assert(seconds > 0 && seconds < 10, 'The result should retain its authoritative countdown after the dive');
  }

  await answers.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'standings-tab');
  assert.equal(await standings.getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'answers-tab');
  assert.equal(await answers.getAttribute('aria-selected'), 'true');

  await page.setViewportSize({ width: 320, height: 680 });
  await startAnswering();
  await publishResults({ fixtureName: 'player-results-long', band: 'high' });
  await scene.waitFor();
  const fitsDuringDive = await scene.evaluate(node => {
    const animations = node.getAnimations({ subtree: true });
    animations.forEach(animation => { animation.pause(); animation.currentTime = 1800; });
    const frame = node.getBoundingClientRect();
    const award = node.querySelector('.player-cinematic__award').getBoundingClientRect();
    const value = node.querySelector('strong');
    return award.left >= frame.left && award.right <= frame.right && award.bottom <= frame.bottom &&
      value.scrollWidth <= value.clientWidth;
  });
  assert(fitsDuringDive, 'The large score and long tier must fit the 320px-wide cinematic');
  await page.clock.fastForward(2000);
  await staticResults('A'.repeat(512));
  assert((await panels.innerText()).includes('T'.repeat(128)), 'The settled result must show the complete authored tier');
  assert((await panels.innerText()).includes(String(Number.MAX_SAFE_INTEGER)));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Long Results must fit the phone-sized viewport');

  for (const [options, label] of [
    [{ fixtureName: 'player-results-zero' }, 'Accepted zero'],
    [{ fixtureName: 'player-results-miss' }, 'No accepted answer'],
    [{ band: 'high', remainingMs: 100 }, 'Autumn'],
    [{}, 'Autumn'],
  ]) {
    await startAnswering();
    await publishResults(options);
    await staticResults(label);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startAnswering();
  await publishResults({ band: 'high' });
  await staticResults('Autumn');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  await startAnswering();
  await publishResults({ band: 'high' });
  await scene.waitFor();
  await page.evaluate(() => window.webFixture.patch({ status: 'reconnecting' }));
  await staticResults('Autumn');
  await page.evaluate(() => window.webFixture.patch({ status: 'connected' }));
  await staticResults('Autumn');

  await page.reload();
  await page.getByLabel('Your answer', { exact: true }).waitFor();
  await page.evaluate(() => window.webFixture.patch({ status: 'reconnecting' }));
  await publishResults({ band: 'high' });
  await page.evaluate(() => window.webFixture.patch({ status: 'connected' }));
  await staticResults('Autumn');

  return [
    'live Follow dive verifies the approved opening, tier distances, score, and landing hold',
    'the settled result restores the exact score, alias, countdown and keyboard tabs, including phone-width long content',
    'misses, zero-point answers, legacy results, reduced motion, short Results, and connection recovery use immediate results',
  ];
}
