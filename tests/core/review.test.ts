import { describe, expect, it } from 'vitest';
import { compilePack } from '../../packages/game-core/src/compile.js';
import { GameEngine, readiness, standings } from '../../packages/game-core/src/engine.js';
import { twoPromptPack } from '../fixtures/game.js';
import { deterministicIds, ManualClock } from '../fixtures/harness.js';

function roundWithTwoPlayers() {
  const clock = new ManualClock();
  const engine = new GameEngine({ now: clock.now, newId: deterministicIds(), newGameCode: () => '123456' });
  const committed = engine.commit(compilePack(twoPromptPack()), 0);
  if (!committed.ok) throw new Error(committed.code);
  const first = engine.admit({ gameId: committed.gameId, identityId: 'first', nickname: 'First' });
  const second = engine.admit({ gameId: committed.gameId, identityId: 'second', nickname: 'Second' });
  if (!first.ok || !second.ok) throw new Error('Admission failed.');
  engine.start(committed.gameId, { hostingReady: true });
  clock.set(3000);
  engine.wake(engine.timerToken()!);
  return { engine, clock, gameId: committed.gameId, first: first.playerId, second: second.playerId,
    roundId: engine.state().roundId! };
}

describe('independent engine interleaving review', () => {
  it('finalizes at the deadline before removal and ignores the stale wakeup', () => {
    const { engine, clock, gameId, first, second, roundId } = roundWithTwoPlayers();
    const answering = engine.timerToken()!;
    engine.submit({ gameId, roundId, playerId: first, text: 'Ink fin', receivedAtMs: clock.now() });
    clock.set(28000);
    expect(engine.remove(gameId, second)).toEqual({ ok: true, alreadyRemoved: false });
    expect(engine.state().phase).toBe('Results');
    expect(engine.state().phaseDeadlineMs).toBe(38000);
    expect(standings(engine.state())).toEqual([{ playerId: first, nickname: 'First', rank: 1, publishedTotal: 50 }]);
    expect(engine.state().rounds[0].points).toEqual([{ playerId: first, points: 50 }, { playerId: second, points: 0 }]);
    expect(engine.wake(answering)).toBe(false);
    expect(engine.remove(gameId, second)).toEqual({ ok: true, alreadyRemoved: true });
    expect(engine.state().players[0].publishedTotal).toBe(50);
    expect(engine.state().rounds[0].results?.groups[0].count).toBe(1);
  });

  it('removal of an accepted player preserves statistics but excludes that player from later eligibility', () => {
    const { engine, clock, gameId, first, second, roundId } = roundWithTwoPlayers();
    engine.submit({ gameId, roundId, playerId: first, text: 'Ink fin', receivedAtMs: clock.now() });
    engine.remove(gameId, first);
    expect(readiness(engine.state())).toEqual({ accepted: 0, eligible: 1 });
    engine.submit({ gameId, roundId, playerId: second, text: 'Inkfin private fixture', receivedAtMs: clock.now() });
    expect(engine.state().phase).toBe('Results');
    expect(engine.state().rounds[0].results?.groups[0].count).toBe(2);
    expect(standings(engine.state())).toEqual([{ playerId: second, nickname: 'Second', rank: 1, publishedTotal: 50 }]);
    clock.set(13000);
    engine.wake(engine.timerToken()!);
    expect(engine.state().phase).toBe('Reading');
    expect(readiness(engine.state())).toEqual({ accepted: 0, eligible: 1 });
    expect(engine.resumePlayer(gameId, first)).toEqual({ ok: false, code: 'REMOVED' });
    expect(engine.admit({ gameId, identityId: 'first', nickname: 'Renamed' })).toEqual({ ok: false, code: 'REMOVED' });
  });

  it('uses complete-handler receipt for an on-time command delayed within the serialized adapter', () => {
    const { engine, clock, gameId, first, second, roundId } = roundWithTwoPlayers();
    engine.submit({ gameId, roundId, playerId: first, text: 'Ink fin', receivedAtMs: clock.now() });
    clock.set(28001);
    expect(engine.submit({ gameId, roundId, playerId: second, text: 'Haddock', receivedAtMs: 27999 }))
      .toEqual({ ok: true, outcome: 'ACCEPTED', locked: true, submittedText: 'Haddock' });
    expect(engine.state().phase).toBe('Results');
    expect(engine.state().phaseDeadlineMs).toBe(38001);
    expect(engine.state().rounds[0].points.map(row => row.points)).toEqual([50, 0]);
  });

  it('keeps zero-player Answering open until its deadline after everyone is removed', () => {
    const { engine, clock, gameId, first, second } = roundWithTwoPlayers();
    engine.remove(gameId, first);
    engine.remove(gameId, second);
    expect(readiness(engine.state())).toEqual({ accepted: 0, eligible: 0 });
    expect(engine.state().phase).toBe('Answering');
    const token = engine.timerToken()!;
    clock.set(27999);
    expect(engine.wake(token)).toBe(false);
    clock.set(28000);
    expect(engine.wake(token)).toBe(true);
    expect(engine.state().rounds[0].results?.groups).toEqual([]);
    expect(engine.state().rounds[0].results?.unused?.canonicalText).toBe('Inkfin private fixture');
    expect(standings(engine.state())).toEqual([]);
  });
});
