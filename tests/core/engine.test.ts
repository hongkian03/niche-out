import { describe, expect, it } from 'vitest';
import { GameEngine, readiness, standings, type EngineOptions, type TimerToken } from '../../packages/game-core/src/engine.js';
import { compilePack } from '../../packages/game-core/src/compile.js';
import { ManualClock, deterministicIds } from '../fixtures/harness.js';

function pack(roundCount = 1, settings?: { readingSeconds: number; answerSeconds: number; resultsSeconds: number }) {
  return compilePack({ schemaVersion: 1, ...(settings ? { settings } : {}),
    tiers: [{ id: 'rare', name: 'Rare', points: 100 }, { id: 'common', name: 'Common', points: 10 }, { id: 'zero', name: 'Zero', points: 0 }],
    prompts: Array.from({ length: roundCount }, (_, index) => ({ id: 'prompt-' + index, text: 'Prompt ' + index,
      answers: [{ text: 'Autumn', aliases: ['Fall'], tierId: 'rare' }, { text: 'Winter', tierId: 'rare' },
        { text: 'Summer', tierId: 'common' }, { text: 'Nothing', tierId: 'zero' }] })) });
}
function fixture(roundCount = 1, settings?: { readingSeconds: number; answerSeconds: number; resultsSeconds: number }) {
  const clock = new ManualClock(); let code = 100000;
  const engine = new GameEngine({ now: clock.now, newId: deterministicIds(), newGameCode: () => String(code++) });
  const definition = pack(roundCount, settings);
  const committed = engine.commit(definition, 0); if (!committed.ok) throw Error(committed.code);
  const gameId = committed.gameId;
  function join(name: string, identityId = name) {
    const result = engine.admit({ gameId, identityId, nickname: name }); if (!result.ok) throw Error(result.code);
    return result.playerId;
  }
  function next() {
    const timer = engine.timerToken(); if (!timer) throw Error('No timer');
    clock.set(timer.deadlineMs); expect(engine.wake(timer)).toBe(true);
  }
  function start() { expect(engine.start(gameId, { hostingReady: true })).toEqual({ ok: true }); }
  function submit(playerId: string, text: string, receivedAtMs = clock.now()) {
    return engine.submit({ gameId, roundId: engine.state().roundId!, playerId, text, receivedAtMs });
  }
  return { engine, clock, definition, gameId, join, next, start, submit };
}

describe('E2-S02 committed game identity', () => {
  it('begins in Setup; compilation alone creates no lobby', () => {
    const engine = new GameEngine({ now: () => 0, newId: deterministicIds(), newGameCode: () => '123456' });
    pack(); expect(engine.state()).toMatchObject({ phase: 'Setup', revision: 0, setupGeneration: 0, gameId: null });
  });
  it('replaces lobby atomically and invalidates previous memberships and callbacks', () => {
    const f = fixture(); const oldPlayer = f.join('First'); const before = f.engine.state();
    const result = f.engine.commit(f.definition, before.setupGeneration);
    expect(result.ok).toBe(true); const after = f.engine.state();
    expect(after.gameId).not.toBe(before.gameId); expect(after.gameCode).not.toBe(before.gameCode);
    expect(after.phaseId).not.toBe(before.phaseId); expect(after.players).toEqual([]); expect(after.rounds).toEqual([]);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(f.engine.resumePlayer(f.gameId, oldPlayer)).toEqual({ ok: false, code: 'WRONG_GAME' });
  });
  it('stale generation and uncompiled definitions preserve entire state', () => {
    const f = fixture(); f.join('A'); const before = f.engine.state();
    expect(f.engine.commit(f.definition, -1)).toEqual({ ok: false, code: 'STALE_GENERATION' });
    expect(f.engine.commit({ ...f.definition }, before.setupGeneration)).toEqual({ ok: false, code: 'INVALID_PACK' });
    expect(f.engine.state()).toEqual(before);
  });
  it('import generation advances without replacing the lobby and Start invalidates candidates', () => {
    const f = fixture(); f.join('A'); const before = f.engine.state();
    expect(f.engine.advanceSetupGeneration()).toEqual({ ok: true, setupGeneration: before.setupGeneration + 1 });
    expect(f.engine.state().gameId).toBe(before.gameId);
    expect(f.engine.commit(f.definition, before.setupGeneration)).toEqual({ ok: false, code: 'STALE_GENERATION' });
    f.start(); expect(f.engine.state().setupGeneration).toBe(before.setupGeneration + 2);
    expect(f.engine.advanceSetupGeneration()).toEqual({ ok: false, code: 'INVALID_PHASE' });
  });
  it.each(['Reading', 'Answering', 'Results'])('rejects replacement during %s without mutation', phase => {
    const f = fixture(); f.join('A'); f.start();
    while (f.engine.state().phase !== phase) f.next();
    const before = f.engine.state();
    expect(f.engine.commit(f.definition, before.setupGeneration)).toEqual({ ok: false, code: 'INVALID_PHASE' });
    expect(f.engine.state()).toEqual(before);
  });
  it('rejects repeated/invalid generated code or ID before replacing state', () => {
    let bad = false; let ids = deterministicIds();
    const options: EngineOptions = { now: () => 0, newId: kind => bad ? '' : ids(kind), newGameCode: () => '123456' };
    const engine = new GameEngine(options); expect(engine.commit(pack(), 0).ok).toBe(true);
    const before = engine.state(); expect(engine.commit(pack(), 1)).toEqual({ ok: false, code: 'INVALID_CODE' });
    options.newGameCode = () => '654321'; bad = true;
    expect(engine.commit(pack(), 1)).toEqual({ ok: false, code: 'INVALID_ID' }); expect(engine.state()).toEqual(before);
  });
  it('snapshots cannot mutate players, round records or compiled answers', () => {
    const f = fixture(); f.join('A'); const state = f.engine.state();
    expect(() => { (state.players[0] as { nickname: string }).nickname = 'Changed'; }).toThrow();
    expect(() => { (state.definition!.prompts[0].answers[0] as { points: number }).points = 9; }).toThrow();
    expect(f.engine.state().players[0].nickname).toBe('A');
  });
});

describe('E2-S03 admissions', () => {
  it('normalizes display whitespace and enforces case-insensitive unique fixed nicknames', () => {
    const f = fixture(); const player = f.join('  Alice\t Smith  ', 'identity');
    expect(f.engine.state().players[0].nickname).toBe('Alice Smith');
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'another', nickname: 'ALICE  SMITH' })).toEqual({ ok: false, code: 'NICKNAME_TAKEN' });
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'identity', nickname: 'Changed' })).toEqual({ ok: true, playerId: player, nickname: 'Alice Smith', recovered: true });
    expect(f.engine.state().players).toHaveLength(1);
  });
  it.each(['', ' \t ', 'x'.repeat(33)])('rejects invalid nickname %j without history', nickname => {
    const f = fixture(); expect(f.engine.admit({ gameId: f.gameId, identityId: 'a', nickname })).toEqual({ ok: false, code: 'INVALID_NICKNAME' });
    expect(f.engine.state().players).toHaveLength(0);
  });
  it('bounds concurrent players including disconnected and allows existing recovery at capacity', () => {
    const f = fixture(); const players = Array.from({ length: 100 }, (_, index) => f.join('Player ' + index));
    f.engine.disconnect(f.gameId, players[0]);
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'extra', nickname: 'Extra' })).toEqual({ ok: false, code: 'GAME_FULL' });
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'Player 0', nickname: 'Ignored' })).toMatchObject({ ok: true, recovered: true });
    expect(f.engine.state().players).toHaveLength(100);
  });
  it('bounds historical admissions at exactly 1000, preserves retries and resets on commit', () => {
    const f = fixture(); const retained = f.join('Kept');
    for (let index = 0; index < 999; index++) { const id = f.join('Replaceable', String(index)); f.engine.remove(f.gameId, id); }
    expect(f.engine.state().players).toHaveLength(1000);
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'new', nickname: 'New' })).toEqual({ ok: false, code: 'ADMISSION_HISTORY_LIMIT' });
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'Kept', nickname: 'Kept' })).toMatchObject({ ok: true, playerId: retained });
    const replacement = f.engine.commit(f.definition, f.engine.state().setupGeneration); expect(replacement.ok).toBe(true);
    expect(f.engine.state().players).toHaveLength(0);
  });
  it('closes entry on Start but existing member can recover after disconnect', () => {
    const f = fixture(); const id = f.join('A'); f.start(); f.engine.disconnect(f.gameId, id);
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'B', nickname: 'B' })).toEqual({ ok: false, code: 'ENTRY_CLOSED' });
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'A', nickname: 'B' })).toMatchObject({ ok: true, playerId: id });
  });
});

describe('E2-S04 phase scheduler', () => {
  it('gates Start on a player, readiness and import completion, then starts exactly once', () => {
    const f = fixture(); expect(f.engine.start(f.gameId, { hostingReady: true })).toEqual({ ok: false, code: 'NO_PLAYERS' });
    f.join('A'); expect(f.engine.start(f.gameId)).toEqual({ ok: false, code: 'TUNNEL_NOT_READY' });
    expect(f.engine.start(f.gameId, { hostingReady: true, importInProgress: true })).toEqual({ ok: false, code: 'IMPORT_IN_PROGRESS' });
    f.start(); const before = f.engine.state();
    expect(f.engine.start(f.gameId, { hostingReady: true })).toEqual({ ok: false, code: 'INVALID_PHASE' }); expect(f.engine.state()).toEqual(before);
  });
  it('runs every prompt in file order with default 3/25/10 second phases', () => {
    const f = fixture(2); f.join('A'); f.start();
    expect(f.engine.state()).toMatchObject({ phase: 'Reading', roundIndex: 0, phaseDeadlineMs: 3000 });
    f.next(); expect(f.engine.state()).toMatchObject({ phase: 'Answering', phaseDeadlineMs: 28000 });
    f.next(); expect(f.engine.state()).toMatchObject({ phase: 'Results', phaseDeadlineMs: 38000 });
    f.next(); expect(f.engine.state()).toMatchObject({ phase: 'Reading', roundIndex: 1, phaseDeadlineMs: 41000 });
    f.next(); f.next(); f.next();
    expect(f.engine.state()).toMatchObject({ phase: 'Finished', roundIndex: null, roundId: null, phaseDeadlineMs: null });
    expect(f.engine.state().rounds).toHaveLength(2); expect(f.engine.timerToken()).toBeNull();
  });
  it('honors custom whole millisecond durations', () => {
    const f = fixture(1, { readingSeconds: 0.101, answerSeconds: 0.107, resultsSeconds: 0.109 }); f.join('A'); f.start();
    expect(f.engine.timerToken()!.deadlineMs).toBe(101); f.next(); expect(f.engine.timerToken()!.deadlineMs).toBe(208);
    f.next(); expect(f.engine.timerToken()!.deadlineMs).toBe(317); f.next(); expect(f.clock.now()).toBe(317);
  });
  it('ignores early, stale, duplicate and wrong-identity wakeups', () => {
    const f = fixture(); f.join('A'); f.start(); const token = f.engine.timerToken()!;
    expect(f.engine.wake(token)).toBe(false); f.clock.set(token.deadlineMs);
    for (const key of ['serverInstanceId', 'gameId', 'roundId', 'phaseId', 'phase', 'deadlineMs'] as const) {
      expect(f.engine.wake({ ...token, [key]: key === 'deadlineMs' ? token.deadlineMs + 1 : 'wrong' } as TimerToken)).toBe(false);
    }
    expect(f.engine.wake(token)).toBe(true); const after = f.engine.state();
    expect(f.engine.wake(token)).toBe(false); expect(f.engine.state()).toEqual(after);
  });
  it.each(['Reading', 'Answering', 'Results'])('suspension closes only one expired %s phase and gives next full duration', phase => {
    const f = fixture(2); f.join('A'); f.start(); while (f.engine.state().phase !== phase) f.next();
    f.clock.set(f.clock.now() + 1000000); expect(f.engine.resumeAfterSuspension()).toBe(true);
    const seconds = phase === 'Reading' ? 25 : phase === 'Answering' ? 10 : 3;
    expect(f.engine.state().phaseDeadlineMs).toBe(f.clock.now() + seconds * 1000);
    expect(f.engine.resumeAfterSuspension()).toBe(false);
    expect(f.engine.state().roundIndex).toBe(phase === 'Results' ? 1 : 0);
  });
  it('unexpired suspension recovery preserves the remaining deadline; idle phases do nothing', () => {
    const f = fixture(); expect(f.engine.resumeAfterSuspension()).toBe(false); f.join('A'); f.start();
    f.clock.set(1000); const before = f.engine.state(); expect(f.engine.resumeAfterSuspension()).toBe(false); expect(f.engine.state()).toEqual(before);
  });
});

describe('E2-S05 answer locking and E2-S06 scoring', () => {
  it('allows rejected retries, preserves submitted spelling, locks first accepted answer without revealing metadata', () => {
    const f = fixture(); const a = f.join('A'); f.join('B'); f.start(); f.next();
    expect(f.submit(a, 'Unlisted')).toEqual({ ok: true, outcome: 'REJECTED', locked: false, submittedText: null });
    expect(f.submit(a, ' FALL ')).toEqual({ ok: true, outcome: 'ACCEPTED', locked: true, submittedText: ' FALL ' });
    expect(f.submit(a, 'Summer')).toEqual({ ok: true, outcome: 'ALREADY_LOCKED', locked: true, submittedText: ' FALL ' });
    expect(f.engine.state().players[0].publishedTotal).toBe(0); expect(readiness(f.engine.state())).toEqual({ accepted: 1, eligible: 2 });
  });
  it('locks an accepted zero-point answer and closes early only on everyone answered', () => {
    const f = fixture(); const a = f.join('A'); const b = f.join('B'); f.start(); f.next();
    expect(f.submit(a, 'Nothing')).toMatchObject({ ok: true, outcome: 'ACCEPTED' }); expect(f.engine.state().phase).toBe('Answering');
    f.submit(b, 'Summer'); expect(f.engine.state().phase).toBe('Results');
    expect(f.engine.state().rounds[0].points).toEqual([{ playerId: a, points: 0 }, { playerId: b, points: 10 }]);
    expect(f.engine.state().rounds[0].submissions).toHaveLength(2);
  });
  it('accepts immediately before the deadline but rejects exact equality and transitions despite delayed timer', () => {
    const f = fixture(); const a = f.join('A'); const b = f.join('B'); f.start(); f.next();
    const deadline = f.engine.timerToken()!.deadlineMs; f.clock.set(deadline - 1);
    expect(f.submit(a, 'Fall')).toMatchObject({ ok: true, outcome: 'ACCEPTED' }); f.clock.set(deadline);
    expect(f.submit(b, 'Winter')).toEqual({ ok: false, code: 'EXPIRED' }); expect(f.engine.state().phase).toBe('Results');
    expect(f.engine.state().players.map(p => p.publishedTotal)).toEqual([100, 0]);
  });
  it('rejects before-answering, wrong-round, stale-game, malformed text and impossible receipt times', () => {
    const f = fixture(); const a = f.join('A'); f.start(); expect(f.submit(a, 'Fall')).toEqual({ ok: false, code: 'NOT_ANSWERING' }); f.next();
    const input = { gameId: f.gameId, roundId: f.engine.state().roundId!, playerId: a, text: 'Fall', receivedAtMs: f.clock.now() };
    expect(f.engine.submit({ ...input, gameId: 'old' })).toEqual({ ok: false, code: 'WRONG_GAME' });
    expect(f.engine.submit({ ...input, roundId: 'old' })).toEqual({ ok: false, code: 'WRONG_ROUND' });
    expect(f.submit(a, '')).toEqual({ ok: false, code: 'INVALID_PAYLOAD' });
    for (const time of [0, f.clock.now() + 1, Infinity, NaN]) expect(f.submit(a, 'Fall', time)).toEqual({ ok: false, code: 'INVALID_RECEIPT' });
  });
  it('scores duplicates at assigned points and groups aliases; finalization is once-only', () => {
    const f = fixture(); const a = f.join('A'); const b = f.join('B'); const c = f.join('C'); f.start(); f.next(); const stale = f.engine.timerToken()!;
    f.submit(a, 'Autumn'); f.submit(b, 'Fall'); f.submit(c, 'Summer');
    expect(f.engine.state().rounds[0].results).toEqual({ groups: [
      { canonicalText: 'Autumn', tierName: 'Rare', points: 100, count: 2 },
      { canonicalText: 'Summer', tierName: 'Common', points: 10, count: 1 }],
      unused: { canonicalText: 'Winter', tierName: 'Rare', points: 100 } });
    expect(standings(f.engine.state()).map(p => [p.rank, p.publishedTotal])).toEqual([[1, 100], [1, 100], [3, 10]]);
    expect(f.engine.wake(stale)).toBe(false); expect(f.engine.state().players.map(p => p.publishedTotal)).toEqual([100, 100, 10]);
  });
  it('sorts tied groups in JSON order even when submissions arrive in opposite order', () => {
    const f = fixture(); const a = f.join('A'); const b = f.join('B'); f.start(); f.next(); f.submit(a, 'Winter'); f.submit(b, 'Autumn');
    expect(f.engine.state().rounds[0].results!.groups.map(group => group.canonicalText)).toEqual(['Autumn', 'Winter']);
  });
  it('chooses highest unused by file order on empty round, and omits it when all used', () => {
    const empty = fixture(); empty.join('A'); empty.start(); empty.next(); empty.next();
    expect(empty.engine.state().rounds[0].results).toMatchObject({ groups: [], unused: { canonicalText: 'Autumn' } });
    const used = fixture(); const ids = ['A', 'B', 'C', 'D'].map(name => used.join(name)); used.start(); used.next();
    ['Winter', 'Autumn', 'Summer', 'Nothing'].forEach((answer, index) => used.submit(ids[index], answer));
    expect(used.engine.state().rounds[0].results!.unused).toBeNull();
  });
  it('accumulates scores across rounds; misses and accepted zero remain distinguishable', () => {
    const f = fixture(2); const a = f.join('A'); const b = f.join('B'); f.start(); f.next(); f.submit(a, 'Nothing'); f.next();
    expect(f.engine.state().rounds[0].submissions.map(s => s.playerId)).toEqual([a]);
    expect(f.engine.state().rounds[0].points).toEqual([{ playerId: a, points: 0 }, { playerId: b, points: 0 }]);
    f.next(); f.next(); f.submit(a, 'Summer'); f.submit(b, 'Fall'); f.next();
    expect(f.engine.state().phase).toBe('Finished'); expect(standings(f.engine.state()).map(p => p.publishedTotal)).toEqual([100, 10]);
  });
});

describe('E2-S07 disconnection and removal', () => {
  it('disconnection keeps a player eligible, their answer and score; reconnect restores the same member', () => {
    const f = fixture(); const a = f.join('A'); const b = f.join('B'); f.start(); f.next(); f.submit(a, 'Fall'); f.engine.disconnect(f.gameId, b);
    expect(readiness(f.engine.state())).toEqual({ accepted: 1, eligible: 2 }); expect(f.engine.state().phase).toBe('Answering');
    f.engine.disconnect(f.gameId, a); expect(f.engine.resumePlayer(f.gameId, a)).toEqual({ ok: true });
    expect(f.engine.state().rounds[0].submissions[0].submittedText).toBe('Fall'); f.next();
    expect(f.engine.state().players.find(p => p.playerId === a)!.publishedTotal).toBe(100);
  });
  it('removing the final unanswered player closes once while preventing their identity recovery', () => {
    const f = fixture(); const a = f.join('A'); const b = f.join('B'); f.start(); f.next(); f.submit(a, 'Fall');
    expect(f.engine.remove(f.gameId, b)).toEqual({ ok: true, alreadyRemoved: false }); expect(f.engine.state().phase).toBe('Results');
    const after = f.engine.state(); expect(f.engine.remove(f.gameId, b)).toEqual({ ok: true, alreadyRemoved: true }); expect(f.engine.state()).toEqual(after);
    expect(f.engine.resumePlayer(f.gameId, b)).toEqual({ ok: false, code: 'REMOVED' });
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'B', nickname: 'New' })).toEqual({ ok: false, code: 'REMOVED' });
    expect(standings(f.engine.state()).map(p => p.playerId)).toEqual([a]);
  });
  it('removing an accepted player changes readiness but retains their answer count', () => {
    const f = fixture(); const a = f.join('A'); const b = f.join('B'); f.start(); f.next(); f.submit(a, 'Fall'); f.engine.remove(f.gameId, a);
    expect(readiness(f.engine.state())).toEqual({ accepted: 0, eligible: 1 }); f.submit(b, 'Summer');
    expect(f.engine.state().rounds[0].results!.groups[0]).toMatchObject({ canonicalText: 'Autumn', count: 1 });
    expect(standings(f.engine.state()).map(p => p.playerId)).toEqual([b]);
  });
  it('never early-completes an empty roster and continues by scheduled deadlines', () => {
    const f = fixture(); const a = f.join('A'); f.start(); f.next(); f.engine.remove(f.gameId, a);
    expect(readiness(f.engine.state())).toEqual({ accepted: 0, eligible: 0 }); expect(f.engine.state().phase).toBe('Answering');
    f.next(); expect(f.engine.state().phase).toBe('Results'); f.next(); expect(f.engine.state().phase).toBe('Finished');
  });
  it('frees a Lobby name and slot only for a different identity', () => {
    const f = fixture(); const a = f.join('Same', 'old'); f.engine.remove(f.gameId, a);
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'old', nickname: 'Same' })).toEqual({ ok: false, code: 'REMOVED' });
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'new', nickname: 'Same' })).toMatchObject({ ok: true, recovered: false });
  });
});

describe('engine adapter boundary regressions', () => {
  it('accepts an on-time complete-handler receipt processed late, then closes the expired round', () => {
    const f = fixture(); const a = f.join('A'); f.join('B'); f.start(); f.next();
    const deadline = f.engine.timerToken()!.deadlineMs; f.clock.set(deadline + 100);
    expect(f.submit(a, 'Fall', deadline - 1)).toMatchObject({ ok: true, outcome: 'ACCEPTED' });
    expect(f.engine.state().phase).toBe('Results'); expect(f.engine.state().phaseDeadlineMs).toBe(f.clock.now() + 10000);
    expect(f.engine.state().players[0].publishedTotal).toBe(100);
  });
  it('existing-member admission recovery notices delayed phase expiry', () => {
    const f = fixture(); f.join('A'); f.start(); f.clock.set(4000);
    expect(f.engine.admit({ gameId: f.gameId, identityId: 'A', nickname: 'ignored' })).toMatchObject({ ok: true, recovered: true });
    expect(f.engine.state()).toMatchObject({ phase: 'Answering', phaseDeadlineMs: 29000 });
  });
  it('stale-game commands cannot advance an expired current phase', () => {
    const f = fixture(); const a = f.join('A'); f.start(); f.clock.set(4000); const before = f.engine.state();
    expect(f.engine.remove('old', a)).toEqual({ ok: false, code: 'WRONG_GAME' });
    expect(f.engine.resumePlayer('old', a)).toEqual({ ok: false, code: 'WRONG_GAME' });
    expect(f.engine.submit({ gameId: 'old', roundId: before.roundId!, playerId: a, text: 'Fall', receivedAtMs: 4000 })).toEqual({ ok: false, code: 'WRONG_GAME' });
    expect(f.engine.state()).toEqual(before);
  });
  it('prepares all phase identities before Start or finalization mutates committed game state', () => {
    let sequence = 0; let failAt = Infinity;
    const clock = new ManualClock();
    const engine = new GameEngine({ now: clock.now, newId: kind => ++sequence === failAt ? '' : kind, newGameCode: () => '123456' });
    const committed = engine.commit(pack(), 0); if (!committed.ok) throw Error('commit');
    engine.admit({ gameId: committed.gameId, identityId: 'a', nickname: 'A' });
    const lobby = engine.state(); failAt = sequence + 2;
    expect(() => engine.start(committed.gameId, { hostingReady: true })).toThrow(); expect(engine.state()).toEqual(lobby);
    failAt = Infinity; engine.start(committed.gameId, { hostingReady: true });
    let token = engine.timerToken()!; clock.set(token.deadlineMs); engine.wake(token);
    token = engine.timerToken()!; clock.set(token.deadlineMs); const answering = engine.state(); failAt = sequence + 1;
    expect(() => engine.wake(token)).toThrow(); expect(engine.state()).toEqual(answering);
    failAt = Infinity; expect(engine.wake(token)).toBe(true); expect(engine.state().phase).toBe('Results');
  });
  it('keeps generated occurrence identities distinct without retaining past games', () => {
    let code = 100000;
    const engine = new GameEngine({ now: () => 0, newId: kind => kind, newGameCode: () => String(code++) });
    const gameIds = new Set<string>(); const phaseIds = new Set<string>();
    for (let index = 0; index < 10; index++) {
      expect(engine.commit(pack(), engine.state().setupGeneration).ok).toBe(true);
      gameIds.add(engine.state().gameId!); phaseIds.add(engine.state().phaseId);
    }
    expect(gameIds.size).toBe(10); expect(phaseIds.size).toBe(10);
  });
});
