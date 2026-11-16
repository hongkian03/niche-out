import { describe, expect, it } from 'vitest';
import { completeView, invitationForOrigin } from '../../packages/contracts/src/index.js';
import { compilePack } from '../../packages/game-core/src/compile.js';
import { GameEngine } from '../../packages/game-core/src/engine.js';
import { projectHost, projectPlayer } from '../../packages/game-core/src/projections.js';
import { ManualClock, deterministicIds } from '../fixtures/harness.js';
import { privatePackMarker, roundOne, twoPromptPack } from '../fixtures/game.js';

function harness() {
  const clock = new ManualClock();
  let code = 100000;
  const engine = new GameEngine({ now: clock.now, newId: deterministicIds(), newGameCode: () => String(++code) });
  const definition = compilePack(twoPromptPack());
  expect(engine.commit(definition, engine.state().setupGeneration).ok).toBe(true);
  const gameId = engine.state().gameId!;
  const add = (nickname: string) => {
    const result = engine.admit({ gameId, identityId: 'browser-' + nickname, nickname });
    if (!result.ok) throw new Error(result.code);
    return result.playerId;
  };
  const expire = () => {
    const token = engine.timerToken()!;
    clock.set(engine.state().phaseDeadlineMs!);
    engine.wake(token);
  };
  const answer = (playerId: string, text: string) => engine.submit({
    gameId, roundId: engine.state().roundId!, playerId, text, receivedAtMs: clock.now(),
  });
  const hosting = { status: 'ready', publicOrigin: 'https://core-session.example.com' } as const;
  const host = (requestedRoundId?: string) => projectHost(engine.state(), {
    hosting, invitation: invitationForOrigin(hosting.publicOrigin, engine.state().gameCode!),
    serverNowMs: clock.now(), requestedRoundId,
  });
  const player = (playerId: string, requestedRoundId?: string) => projectPlayer(engine.state(), {
    playerId, controlGeneration: 1, serverNowMs: clock.now(), requestedRoundId,
  });
  return { clock, engine, definition, gameId, add, expire, answer, host, player };
}

describe('Epic 2 full deterministic core gate', () => {
  it('runs the independent two-round oracle through retries, locks, disconnect, removal, final recap and replacement', () => {
    const h = harness();
    const ids = ['Ada', 'Bo', 'Cal', 'Dan'].map(h.add);
    expect(h.engine.start(h.gameId, { hostingReady: true }).ok).toBe(true);
    const firstRound = h.engine.state().roundId!;
    const obsoleteTimer = h.engine.timerToken()!;
    h.expire();
    expect(h.answer(ids[0], 'unlisted answer')).toMatchObject({ ok: true, outcome: 'REJECTED' });
    roundOne.submissions.forEach((text, i) => {
      if (text !== null) expect(h.answer(ids[i], text)).toMatchObject({ ok: true, outcome: 'ACCEPTED' });
    });
    expect(h.answer(ids[0], 'Haddock')).toMatchObject({ ok: true, outcome: 'ALREADY_LOCKED' });
    expect(h.engine.disconnect(h.gameId, ids[3]).ok).toBe(true);
    expect(h.host()).toMatchObject({ phase: 'Answering', readiness: { accepted: 3, eligible: 4 } });
    h.expire();
    const roundView = h.host();
    if (roundView.phase !== 'Results') throw new Error('Expected first Results');
    expect(roundView.standings.map(row => row.roundPoints)).toEqual(roundOne.points);
    expect(roundView.standings.map(row => row.rank)).toEqual(roundOne.ranks);
    expect(roundView.results.groups.map(row => [row.canonicalText, row.count])).toEqual(roundOne.groupedCounts);
    expect(roundView.results.unused?.canonicalText).toBe(roundOne.unusedExample);
    const beforeStaleTimer = h.engine.state();
    h.engine.wake(obsoleteTimer);
    expect(h.engine.state()).toEqual(beforeStaleTimer);
    expect(h.engine.remove(h.gameId, ids[1]).ok).toBe(true);
    expect(() => h.player(ids[1])).toThrow('REMOVED');
    expect(h.engine.resumePlayer(h.gameId, ids[3]).ok).toBe(true);
    h.expire();
    expect(() => h.host(firstRound)).toThrow('RECAP_NOT_AVAILABLE');
    expect(() => h.player(ids[0], firstRound)).toThrow('RECAP_NOT_AVAILABLE');
    expect(h.player(ids[0])).toMatchObject({ phase: 'Reading', publishedTotal: 50 });
    h.expire();
    h.answer(ids[0], 'gannet');
    h.answer(ids[2], 'GANNET');
    h.expire();
    expect(h.player(ids[3])).toMatchObject({ ownResult: { outcome: 'miss', points: 0 } });
    h.expire();
    const finalHost = h.host(firstRound);
    expect(finalHost.phase).toBe('Finished');
    if (finalHost.phase !== 'Finished') throw new Error('Expected Finished');
    expect(finalHost.standings.map(row => [row.nickname, row.publishedTotal, row.rank])).toEqual([
      ['Ada', 100, 1], ['Cal', 50, 2], ['Dan', 0, 3],
    ]);
    expect(finalHost.winnerIds).toEqual([ids[0]]);
    expect(finalHost.rounds).toHaveLength(2);
    expect(finalHost.requestedDetail?.results.groups).toEqual([
      { canonicalText: privatePackMarker, tierName: 'Rare', points: 50, count: 2 },
      { canonicalText: 'Haddock', tierName: 'Ordinary', points: 0, count: 1 },
    ]);
    const own = h.player(ids[0], firstRound);
    expect(own).toMatchObject({ rounds: [
      { ownResult: { outcome: 'accepted', submittedText: 'ink fin', points: 50 } },
      { ownResult: { outcome: 'accepted', submittedText: 'gannet', points: 50 } },
    ] });
    expect(JSON.stringify(finalHost)).not.toContain('submittedText');
    expect(JSON.stringify(finalHost)).not.toContain('ownResult');
    expect(JSON.stringify(finalHost)).not.toContain('Wrasse');
    expect(JSON.stringify(own)).not.toContain('GANNET');
    expect(h.player(ids[2])).toMatchObject({ rounds: [
      { ownResult: { submittedText: 'Haddock', points: 0 } },
      { ownResult: { submittedText: 'GANNET', points: 50 } },
    ] });
    expect(() => h.player(ids[0], 'unknown-round')).toThrow('ROUND_NOT_FOUND');
    for (const view of [finalHost, own, h.player(ids[2]), h.player(ids[3])]) {
      expect(completeView.safeParse(view).success).toBe(true);
    }
    const oldCode = h.engine.state().gameCode;
    const replacement = h.engine.commit(h.definition, h.engine.state().setupGeneration);
    expect(replacement.ok).toBe(true);
    expect(h.engine.state()).toMatchObject({ phase: 'Lobby', players: [], rounds: [] });
    expect(h.engine.state().gameId).not.toBe(h.gameId);
    expect(h.engine.state().gameCode).not.toBe(oldCode);
    expect(() => h.player(ids[0])).toThrow('PLAYER_NOT_FOUND');
    expect(() => h.host(firstRound)).toThrow('RECAP_NOT_AVAILABLE');
    expect(h.engine.admit({ gameId: h.gameId, identityId: 'browser-Ada', nickname: 'Ada' })).toMatchObject({ ok: false, code: 'WRONG_GAME' });
    expect(completeView.safeParse(h.host()).success).toBe(true);
  });

  it('publishes joint winners and final details only on request, never other players’ private spellings', () => {
    const h = harness(); const a = h.add('Ada'); const b = h.add('Bo'); const c = h.add('Cal');
    h.engine.start(h.gameId, { hostingReady: true }); h.expire();
    const firstRound = h.engine.state().roundId!;
    h.answer(a, 'iNk fIn'); h.answer(b, 'INK FIN'); h.answer(c, 'Haddock');
    expect(h.engine.state().phase).toBe('Results');
    h.expire(); h.expire();
    h.answer(a, 'Gull'); h.answer(b, 'gUlL'); h.answer(c, 'Gull');
    h.expire();
    const host = h.host();
    expect(host).toMatchObject({ phase: 'Finished', winnerIds: [a, b], requestedDetail: null,
      standings: [{ rank: 1, publishedTotal: 50 }, { rank: 1, publishedTotal: 50 }, { rank: 3, publishedTotal: 0 }] });
    expect(h.player(a)).toMatchObject({ requestedDetail: null });
    expect(JSON.stringify(h.player(a, firstRound))).not.toContain('INK FIN');
    expect(JSON.stringify(h.player(a, firstRound))).not.toContain('gUlL');
    expect(JSON.stringify(h.host(firstRound))).not.toContain('iNk fIn');
    expect(JSON.stringify(h.host(firstRound))).not.toContain('INK FIN');
    expect(completeView.safeParse(host).success).toBe(true);
  });
});
