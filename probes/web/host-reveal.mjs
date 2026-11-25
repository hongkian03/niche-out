import assert from 'node:assert/strict';

export async function verifyHostReveal(page, origin) {
  await page.clock.install();
  await page.goto(origin + '/?fixture=host-answering');
  await page.bringToFront();

  const host = page.locator('.host-shell');
  const stage = host.locator('.host-stage');
  const pulse = stage.locator('.host-sonar-pulse');
  const results = stage.locator('.results-grid');
  const groups = results.locator('.answer-groups');
  const rankings = results.locator('.standings table tbody tr');
  const stageTimer = stage.locator('.phase-strip .timer-ring span');
  const manageButton = host.getByRole('button', { name: 'Manage players', exact: true });
  let round = 0;

  async function startAnswering() {
    const roundId = 'host-reveal-round-' + ++round;
    await page.evaluate(roundId => {
      const fixture = window.webFixture;
      const next = fixture.snapshot('host-answering');
      const now = Date.now();
      fixture.patch({ ...next, view: {
        ...next.view, phaseId: roundId + '-answering', roundId,
        serverNowMs: now, phaseDeadlineMs: now + 8000,
      } });
    }, roundId);
    await stage.getByRole('heading', { name: 'Answers open', exact: true }).waitFor();
    assert.equal(await pulse.count(), 0, 'Host showed the cue before Results');
    assert.equal(await groups.count(), 0, 'Host showed answer groups before Results');
    assert.match(await stage.locator('.readiness-count').innerText(), /50 of 100 answers locked/);
  }

  async function reveal({ timeLeft = 6000, replace = false, reconnect = false, empty = false } = {}) {
    await page.evaluate(({ timeLeft, replace, reconnect, empty }) => {
      const fixture = window.webFixture;
      const { view: current } = fixture.state();
      const { view: next } = fixture.snapshot('host-results');
      const now = Date.now();
      if (reconnect) {
        fixture.patch({ status: 'reconnecting' });
        fixture.patch({ status: 'connected' });
      }
      fixture.changeView({
        ...next,
        gameId: replace ? 'replacement-game' : current.gameId,
        roundId: current.roundId,
        phaseId: current.roundId + '-results',
        revision: current.revision + 1,
        serverNowMs: now,
        phaseDeadlineMs: now + timeLeft,
        standings: empty ? [] : next.standings.map(row => ({ ...row, rank: 1, roundPoints: 100, publishedTotal: 100 })),
        results: {
          groups: empty ? [] : [{ ...next.results.groups[0], count: 100 }],
          unused: null,
        },
      });
    }, { timeLeft, replace, reconnect, empty });
    await results.waitFor();
  }

  async function staticResults() {
    assert.equal(await pulse.count(), 0, 'A result outside the live reveal window animated');
    assert(await results.isVisible(), 'The host result must remain readable');
    assert(await stageTimer.isVisible(), 'The host countdown must remain visible');
  }

  await startAnswering();
  const prompt = stage.locator('.prompt-panel');
  const promptBefore = await prompt.boundingBox();
  const timerBefore = await stageTimer.boundingBox();
  await reveal();
  await pulse.waitFor();
  assert.equal(await pulse.getAttribute('aria-hidden'), 'true', 'Sonar must be decorative');
  assert(await pulse.evaluate(element =>
    element.getAnimations({ subtree: true }).some(animation => animation.animationName === 'host-sonar-sweep' &&
      animation.effect.getTiming().duration === 600)), 'The live Results cue must run a 600 ms sweep');
  assert.equal(await stage.locator('#phase-heading').innerText(), 'Round complete');
  assert.equal(await results.getByRole('heading', { name: 'Answers from the crew' }).count(), 1);
  assert.equal(await results.getByRole('heading', { name: 'Standings' }).count(), 1);
  assert(await results.isVisible() && await manageButton.isEnabled());
  assert.equal((await prompt.boundingBox()).y, promptBefore.y, 'The reveal shifted the prompt');
  assert.equal((await stageTimer.boundingBox()).y, timerBefore.y, 'The reveal shifted the countdown');
  assert.equal(await groups.locator('.answer-count').innerText(), '100\nanswers');
  assert(!/Crew \d+/.test(await groups.innerText()), 'The answer aggregate must not identify individual players');
  await page.evaluate(() => {
    window.activeHostPulse = document.querySelector('.host-sonar-pulse');
    window.firstHostRow = document.querySelector('.results-grid .standings tbody tr');
  });
  await page.clock.fastForward(220);
  const deadline = await page.evaluate(() => {
    const fixture = window.webFixture;
    const { view } = fixture.state();
    fixture.changeView(view);
    fixture.changeView({ ...view, revision: view.revision + 1, serverNowMs: Date.now() });
    return view.phaseDeadlineMs;
  });
  assert(await pulse.evaluate(element => element === window.activeHostPulse), 'A duplicate or standings update remounted the pulse');
  assert(await rankings.first().evaluate(element => element === window.firstHostRow), 'Results replaced a stable standings row');
  await page.clock.fastForward(425);
  assert.equal(await pulse.count(), 0, 'A same-Results update extended the cue');
  assert.equal(await page.evaluate(() => window.webFixture.state().view.phaseDeadlineMs), deadline);
  await page.clock.fastForward(500);
  assert(Number(await stageTimer.innerText()) < 6, 'The countdown did not advance after the cue');

  assert.equal(await rankings.count(), 10);
  await results.getByRole('button', { name: 'Show all 100 players', exact: true }).click();
  assert.equal(await rankings.count(), 100);
  assert.deepEqual(await rankings.locator('td.rank').allTextContents(), Array(100).fill('1'));
  assert.equal(await rankings.locator('td.total-points').last().innerText(), '100');
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Host standings overflow the projector viewport');

  await startAnswering();
  await manageButton.click();
  const manage = page.getByRole('dialog', { name: 'Manage players', exact: true });
  const search = manage.getByRole('searchbox', { name: 'Search players' });
  await search.fill('Crew 001');
  await search.focus();
  await reveal();
  await pulse.waitFor();
  assert(await manage.evaluate(element => element.contains(document.activeElement)), 'The cue took focus out of Manage players');
  assert.equal(await search.inputValue(), 'Crew 001', 'The reveal reset roster search');
  assert(await manage.getByText('Round complete', { exact: true }).isVisible());
  // Escape inside a nonempty native search field can clear the field instead.
  await manage.getByRole('button', { name: 'Close Manage players', exact: true }).focus();
  await page.keyboard.press('Escape');
  await manage.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Manage players');

  // A new authoritative phase can arrive before the local decoration expires.
  await startAnswering();
  await reveal();
  await pulse.waitFor();
  await page.evaluate(() => {
    const fixture = window.webFixture;
    const { view } = fixture.state();
    fixture.changeView({
      ...fixture.snapshot('host-final').view,
      revision: view.revision + 1,
      phaseId: view.roundId + '-finished',
    });
  });
  await host.getByRole('heading', { name: 'Joint winners', exact: true }).waitFor();
  assert.equal(await pulse.count(), 0, 'The sonar outlived its Results phase');

  for (const options of [{ timeLeft: 100 }, { replace: true }, { reconnect: true }]) {
    await startAnswering();
    await reveal(options);
    await staticResults();
  }

  await startAnswering();
  await reveal({ empty: true });
  assert(await groups.getByText('No accepted answers this round.').isVisible());
  assert(await results.getByText('No players remaining.').isVisible());

  await startAnswering();
  await reveal();
  await pulse.waitFor();
  await page.evaluate(() => {
    const fixture = window.webFixture;
    fixture.patch({ status: 'reconnecting' });
    fixture.patch({ status: 'connected' });
  });
  await pulse.waitFor({ state: 'detached' });
  await staticResults();

  await startAnswering();
  await reveal();
  await pulse.waitFor();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await pulse.waitFor({ state: 'detached' });
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await staticResults();

  await startAnswering();
  await reveal();
  await pulse.waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await pulse.waitFor({ state: 'detached' });
  await staticResults();
  await startAnswering();
  await reveal();
  await staticResults();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await staticResults();

  await page.goto(origin + '/?fixture=host-results');
  await results.waitFor();
  await staticResults();

  return [
    'host sonar plays once on live Results while its timer, prompt and anonymous answer groups stay visible',
    'projector Results expand to 100 tied standings without overflow and retain rows across updates',
    'host sonar preserves Manage players focus and supports empty standings and early phase advance',
    'short Results, replacement, reconnect, backgrounding, reduced motion and reload show settled host results without replay',
  ];
}
