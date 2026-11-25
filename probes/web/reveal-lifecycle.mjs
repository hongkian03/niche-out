import assert from 'node:assert/strict';

export async function verifyRevealLifecycle(page, origin) {
  await page.clock.install();
  await page.goto(origin + '/?fixture=player-answering');
  await page.bringToFront();
  const answer = page.getByLabel('Your answer', { exact: true });
  const results = page.getByRole('heading', { name: 'Round complete', exact: true });
  const standings = page.getByRole('tab', { name: 'Standings', exact: true });
  const reveal = page.locator('[data-round-reveal="playing"]');
  let round = 1;

  async function publishResults({ remainingMs = 10_000, offsetMs = 0, ignoredState, identity } = {}) {
    await page.evaluate(({ remainingMs, offsetMs, ignoredState, identity }) => {
      const fixture = window.webFixture;
      const prior = fixture.state();
      const next = fixture.snapshot('player-all-used');
      const now = Date.now();
      const gameId = identity === 'game' ? 'replacement-game' : prior.view.gameId;
      const serverInstanceId = identity === 'instance' ? 'replacement-server' : prior.view.serverInstanceId;
      if (ignoredState) fixture.patch(ignoredState);
      fixture.patch({
        ...next,
        clockOffsetMs: offsetMs,
        session: { ...next.session, serverInstanceId, membership: { ...next.session.membership, gameId } },
        ...(identity === 'control' ? { controlGeneration: prior.controlGeneration + 1 } : {}),
        view: {
          ...next.view,
          revision: prior.view.revision + 1,
          serverNowMs: now + offsetMs,
          phaseDeadlineMs: now + remainingMs,
          roundId: identity === 'round' ? 'different-round' : prior.view.roundId,
          phaseId: prior.view.roundId + '-results',
          gameId, serverInstanceId,
        },
      });
    }, { remainingMs, offsetMs, ignoredState, identity });
    await results.waitFor();
  }

  async function answering() {
    await page.evaluate(round => {
      const fixture = window.webFixture;
      const next = fixture.snapshot('player-answering');
      const roundId = 'reveal-fixture-round-' + round;
      fixture.patch({ ...next, view: { ...next.view, roundId, phaseId: roundId + '-answering' } });
    }, ++round);
    await answer.waitFor();
    assert(await answer.isEnabled(), 'Answer entry must be available in the current Answering phase');
  }

  async function staticResults() {
    await results.waitFor();
    assert.equal(await reveal.count(), 0, 'Unexpected motion on an ineligible Results view');
    assert(await standings.isVisible(), 'Standings must remain reachable');
  }

  async function visibility(value) {
    await page.evaluate(value => {
      Object.defineProperties(document, {
        hidden: { configurable: true, value: value !== 'visible' },
        visibilityState: { configurable: true, value },
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, value);
  }

  await answer.waitFor();
  await publishResults();
  await reveal.waitFor();
  await standings.focus();
  await page.keyboard.press('End');
  assert.equal(await standings.getAttribute('aria-selected'), 'true');
  const deadline = await page.evaluate(() => window.webFixture.state().view.phaseDeadlineMs);
  await page.clock.fastForward(1000);
  await page.evaluate(() => {
    const fixture = window.webFixture;
    const { view } = fixture.state();
    fixture.changeView(view);
    fixture.changeView({ ...view, revision: view.revision + 1,
      standings: view.standings.map((row, index) => index === 0 ? { ...row, roundPoints: 42 } : row) });
  });
  assert.equal(await reveal.count(), 1, 'A same-phase standings update interrupted the reveal');
  assert.equal(await standings.getAttribute('aria-selected'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'standings-tab');
  assert.equal(await page.evaluate(() => window.webFixture.state().view.phaseDeadlineMs), deadline);
  assert(await page.locator('#standings-panel').getByText('+42', { exact: true }).isVisible(), 'Latest standings did not update');
  await page.clock.fastForward(1020);
  await reveal.waitFor({ state: 'detached', timeout: 250 });
  await page.waitForFunction(() => Number(document.querySelector('.timer-ring span')?.textContent) < 10);
  await page.evaluate(() => window.webFixture.changeView(window.webFixture.state().view));
  await staticResults();

  await answering();
  await publishResults();
  await reveal.waitFor();
  await page.evaluate(() => {
    const fixture = window.webFixture;
    const prior = fixture.state().view;
    const next = fixture.snapshot('player-reading').view;
    fixture.changeView({ ...next, revision: prior.revision + 1, phaseId: 'phase-next-reading',
      promptCount: 2, roundId: 'round-2', roundIndex: 1, prompt: 'Next round starts now.' });
  });
  await page.getByText('Next round starts now.', { exact: true }).waitFor();
  assert.equal(await reveal.count(), 0, 'A new round retained the previous reveal');
  assert(await answer.isDisabled(), 'Reading must not permit answer entry');
  await page.evaluate(() => {
    const fixture = window.webFixture;
    const { view } = fixture.state();
    fixture.changeView({ ...view, phase: 'Answering', phaseId: 'phase-next-answering', revision: view.revision + 1 });
  });
  await page.waitForFunction(() => !document.getElementById('answer')?.disabled);
  assert(await answer.isEnabled(), 'Previous reveal delayed the next round’s answer entry');

  for (const conditions of [
    { remainingMs: 100 },
    { remainingMs: 4000, offsetMs: 2000 },
    { identity: 'round' },
    { identity: 'game' },
    { identity: 'instance' },
    { identity: 'control' },
    { ignoredState: { status: 'reconnecting' } },
    { ignoredState: { status: 'superseded' } },
  ]) {
    await answering();
    await publishResults(conditions);
    await staticResults();
  }

  await answering();
  await visibility('hidden');
  await publishResults();
  await visibility('visible');
  await staticResults();

  for (const interrupt of [
    () => page.evaluate(() => {
      const fixture = window.webFixture;
      fixture.patch({ status: 'reconnecting' });
      fixture.patch({ status: 'connected' });
    }),
    async () => { await visibility('hidden'); await visibility('visible'); },
  ]) {
    await answering();
    await interrupt();
    await publishResults();
    await staticResults();

    await answering();
    await interrupt();
    await page.evaluate(() => {
      const fixture = window.webFixture;
      const { view } = fixture.state();
      fixture.changeView({ ...view, revision: view.revision + 1, serverNowMs: Date.now() });
    });
    await publishResults();
    await reveal.waitFor();
    await page.clock.fastForward(2000);
    await reveal.waitFor({ state: 'detached' });
  }

  await answering();
  await publishResults();
  await reveal.waitFor();
  await page.evaluate(() => window.webFixture.patch({ clockOffsetMs: 9000 }));
  await reveal.waitFor({ state: 'detached' });
  await staticResults();

  for (const status of ['reconnecting', 'superseded']) {
    await answering();
    await publishResults();
    await reveal.waitFor();
    await page.evaluate(status => {
      const fixture = window.webFixture;
      fixture.patch({ status });
      fixture.patch({ status: 'connected' });
    }, status);
    await reveal.waitFor({ state: 'detached' });
    await staticResults();
  }

  await answering();
  await publishResults();
  await reveal.waitFor();
  await visibility('hidden');
  await reveal.waitFor({ state: 'detached' });
  await visibility('visible');
  await staticResults();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await answering();
  await publishResults();
  await staticResults();

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await answering();
  await publishResults();
  await reveal.waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reveal.waitFor({ state: 'detached' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await staticResults();

  await answering();
  await publishResults();
  await reveal.waitFor();
  await page.evaluate(() => history.replaceState(null, '', '/?fixture=player-all-used'));
  await page.reload();
  await staticResults();

  return [
    'live round reveal starts once and expires on schedule through duplicate and updated standings views',
    'early round advance cancels the reveal and keeps timer, standings and keyboard controls usable',
    'short Results, clock offset, replacement identity, React-coalesced reconnect/control loss, and reload recovery show static results',
    'backgrounding and reduced motion skip or cancel the reveal without replay',
    'after a connection or visibility interruption, only a fresh Answering view can cue Results',
    'an authoritative clock correction cancels motion when time to read Results runs short',
  ];
}
