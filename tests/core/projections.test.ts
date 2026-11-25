import { describe, expect, it } from 'vitest';
import { completeView, invitationForOrigin, type GamePackInput, type HostingStatus } from '../../packages/contracts/src/index.js';
import { compilePack } from '../../packages/game-core/src/compile.js';
import { GameEngine } from '../../packages/game-core/src/engine.js';
import { projectHost, projectPlayer } from '../../packages/game-core/src/projections.js';
import { ManualClock, deterministicIds } from '../fixtures/harness.js';
import { longTextPack, privatePackMarker, twoPromptPack } from '../fixtures/game.js';

const hosting = { status: 'ready', publicOrigin: 'https://session.example.com' } as const;

function scenario(pack: GamePackInput = twoPromptPack()) {
  const clock = new ManualClock();
  let code = 123450;
  const engine = new GameEngine({ now: clock.now, newId: deterministicIds(), newGameCode: () => String(++code) });
  const host = (extra: { requestedRoundId?: string; hosting?: HostingStatus; importInProgress?: boolean } = {}) => projectHost(engine.state(), {
    serverNowMs: clock.now(), hosting,
    ...(engine.state().gameCode ? { invitation: invitationForOrigin(hosting.publicOrigin, engine.state().gameCode!) } : {}), ...extra,
  });
  const player = (playerId: string, requestedRoundId?: string) => projectPlayer(engine.state(), {
    serverNowMs: clock.now(), playerId, controlGeneration: 3, requestedRoundId,
  });
  const commit = () => expect(engine.commit(compilePack(pack), engine.state().setupGeneration).ok).toBe(true);
  const add = (name: string) => {
    expect(engine.admit({ gameId: engine.state().gameId!, identityId: 'identity-' + name, nickname: name }).ok).toBe(true);
    return engine.state().players.find(item => item.nickname === name)!.playerId;
  };
  const start = () => expect(engine.start(engine.state().gameId!, { hostingReady: true }).ok).toBe(true);
  const expire = () => {
    const token = engine.timerToken()!;
    clock.set(engine.state().phaseDeadlineMs!);
    engine.wake(token);
  };
  const answer = (playerId: string, text: string) => engine.submit({
    gameId: engine.state().gameId!, roundId: engine.state().roundId!, playerId, text, receivedAtMs: clock.now(),
  });
  return { engine, clock, host, player, commit, add, start, expire, answer };
}

describe('role-filtered complete views', () => {
  it('omits unused live player standings at capacity while preserving revealed rankings', () => {
    const s = scenario(); s.commit();
    const players = Array.from({ length: 100 }, (_, i) => s.add('Player ' + i));
    s.start();
    for (const phase of ['Reading', 'Answering']) {
      const host = s.host(); const player = s.player(players[0]!);
      expect(player.phase).toBe(phase);
      expect(player).not.toHaveProperty('publishedStandings');
      expect(player).toMatchObject({ protocolVersion: 2, publishedTotal: 0 });
      if (host.phase !== 'Reading' && host.phase !== 'Answering') throw new Error('Expected live host');
      expect(host.publishedStandings).toHaveLength(100);
      const previousShape = { ...player, protocolVersion: 1, publishedStandings: host.publishedStandings };
      expect(Buffer.byteLength(JSON.stringify(player))).toBeLessThan(Buffer.byteLength(JSON.stringify(previousShape)) / 2);
      expect(completeView.safeParse(player).success).toBe(true);
      s.expire();
    }
    const result = s.player(players[0]!);
    expect(result).toMatchObject({ phase: 'Results' });
    if (result.phase !== 'Results') throw new Error('Expected results');
    expect(result.standings).toHaveLength(100);
    expect(result.standings.every(row => row.rank === 1)).toBe(true);
  });

  it('projects Setup and Lobby without answer banks and gates Start on roster, readiness and import', () => {
    const s = scenario();
    expect(completeView.safeParse(s.host()).success).toBe(true);
    expect(s.host()).toMatchObject({ phase: 'Setup', gameId: null, promptCount: 0 });
    s.commit();
    expect(s.host()).toMatchObject({ canStart: false, canReplace: true });
    const p = s.add('Ada');
    expect(s.host()).toMatchObject({ canStart: true, invitation: { code: s.engine.state().gameCode } });
    for (const status of ['starting', 'connecting'] as const) {
      expect(s.host({ hosting: { status } })).toMatchObject({ canStart: false });
    }
    expect(s.host({ hosting: { status: 'reconnecting', publicOrigin: hosting.publicOrigin } })).toMatchObject({ canStart: false });
    expect(s.host({ hosting: { status: 'failed', reason: 'unreachable' } })).toMatchObject({ canStart: false });
    expect(s.host({ importInProgress: true })).toMatchObject({ canStart: false, canReplace: false });
    expect(s.player(p)).toMatchObject({ phase: 'Lobby', title: 'Harbour quiz', admittedCount: 1 });
    for (const view of [s.host(), s.player(p)]) {
      expect(completeView.safeParse(view).success).toBe(true);
      expect(JSON.stringify(view)).not.toContain(privatePackMarker);
      expect(JSON.stringify(view)).not.toContain('Name a seabird.');
      expect(JSON.stringify(view)).not.toContain('identity-Ada');
    }
    expect(() => projectHost(s.engine.state(), {
      hosting, serverNowMs: 0, invitation: invitationForOrigin(hosting.publicOrigin, '999999'),
    })).toThrow('INVITATION_MISMATCH');
  });

  it('reveals only the owner’s locked wording and finalized totals during live play', () => {
    const s = scenario(); s.commit();
    const a = s.add('Ada'); const b = s.add('Bo');
    s.start();
    expect(s.player(a)).toMatchObject({ phase: 'Reading', ownAnswer: { locked: false }, readiness: { accepted: 0, eligible: 2 } });
    s.expire();
    expect(s.answer(a, '  InK  fin  ').ok).toBe(true);
    const own = s.player(a);
    expect(own).toMatchObject({ ownAnswer: { locked: true, submittedText: '  InK  fin  ' }, publishedTotal: 0, controlGeneration: 3 });
    for (const view of [s.host(), s.player(b), own]) {
      const json = JSON.stringify(view);
      for (const hidden of [privatePackMarker, 'Rare', 'tierName', 'tierId', 'Name a seabird.', 'Turbot', 'Wrasse', 'identity-Ada']) {
        expect(json).not.toContain(hidden);
      }
      expect(completeView.safeParse(view).success).toBe(true);
      expect(view).toMatchObject({ readiness: { accepted: 1, eligible: 2 } });
    }
    expect(JSON.stringify(s.host())).not.toContain('InK');
    expect(JSON.stringify(s.player(b))).not.toContain('InK');
    expect(() => s.host({ requestedRoundId: s.engine.state().roundId! })).toThrow('RECAP_NOT_AVAILABLE');
    expect(() => s.player(a, s.engine.state().roundId!)).toThrow('RECAP_NOT_AVAILABLE');
    s.expire();
    expect(s.player(a)).toMatchObject({ phase: 'Results', ownResult: { points: 50, canonicalText: privatePackMarker } });
    s.expire();
    expect(s.player(a)).toMatchObject({ phase: 'Reading', publishedTotal: 50, ownAnswer: { locked: false } });
    expect(JSON.stringify(s.player(a))).not.toContain('InK');
  });

  it('keeps submitted spellings private while exposing anonymous canonical result counts and accepted zero', () => {
    const s = scenario(); s.commit();
    const a = s.add('Ada'); const b = s.add('Bo'); const c = s.add('Cal');
    s.start(); s.expire();
    s.answer(a, 'iNk fIn'); s.answer(b, 'HADDOCK');
    s.expire();
    const host = s.host(); const own = s.player(b);
    expect(host).toMatchObject({ phase: 'Results', results: { groups: [{ canonicalText: privatePackMarker, count: 1 }, { canonicalText: 'Haddock', count: 1 }] } });
    expect(own).toMatchObject({ ownResult: { outcome: 'accepted', points: 0, submittedText: 'HADDOCK' } });
    expect(s.player(c)).toMatchObject({ ownResult: { outcome: 'miss', points: 0 } });
    expect(JSON.stringify(host)).not.toContain('iNk fIn');
    expect(JSON.stringify(host)).not.toContain('HADDOCK');
    expect(JSON.stringify(own)).not.toContain('iNk fIn');
    if (host.phase !== 'Results') throw new Error('Expected Results');
    for (const group of host.results.groups) {
      expect(Object.keys(group).sort()).toEqual(['canonicalText', 'count', 'points', 'tierName']);
    }
    expect(JSON.stringify(host)).not.toContain('Wrasse');
    for (const view of [host, own, s.player(c)]) expect(completeView.safeParse(view).success).toBe(true);
  });

  it('ranks reachable positive points per prompt, preserving ties and safe integer awards', () => {
    const largeAward = Number.MAX_SAFE_INTEGER - 96;
    const pack: GamePackInput = {
      schemaVersion: 1, title: 'Depth calibration',
      tiers: [
        { id: 'large', name: 'Ordinary', points: largeAward },
        { id: 'small', name: 'Rare', points: 10 },
        { id: 'tie-a', name: 'Find A', points: 12 },
        { id: 'middle', name: 'Find C', points: 38 },
        { id: 'tie-b', name: 'Find B', points: 12 },
        { id: 'zero', name: 'Accepted zero', points: 0 },
        { id: 'global-only', name: 'Other', points: 1 },
      ],
      prompts: [
        { id: 'first', text: 'Pick a first-round answer.', answers: [
          { text: 'Large', tierId: 'large' },
          { text: 'Twin A', tierId: 'tie-a' },
          { text: 'Small', tierId: 'small' },
          { text: 'Twin B', tierId: 'tie-b', aliases: ['Alias B'] },
          { text: 'Unsubmitted', tierId: 'middle' },
          { text: 'Zero', tierId: 'zero' },
        ] },
        { id: 'second', text: 'Pick a second-round answer.', answers: [
          { text: 'Small', tierId: 'small' }, { text: 'Twin A', tierId: 'tie-a' },
        ] },
      ],
    };
    const s = scenario(pack); s.commit();
    const a = s.add('Ada'); const b = s.add('Bo'); const c = s.add('Cal');
    const d = s.add('Dio'); const e = s.add('Eve'); const f = s.add('Flo');
    s.start(); s.expire();
    expect(s.answer(a, 'Twin A').ok).toBe(true);
    expect(s.answer(b, 'alias b').ok).toBe(true);
    expect(s.answer(d, 'Zero').ok).toBe(true);
    expect(s.answer(e, 'Large').ok).toBe(true);
    expect(s.answer(f, 'Small').ok).toBe(true);
    expect(JSON.stringify(s.player(a))).not.toContain('diveBand');
    s.expire();

    expect(s.player(a)).toMatchObject({ ownResult: { points: 12, tierName: 'Find A', diveBand: 'medium' } });
    expect(s.player(b)).toMatchObject({ ownResult: {
      points: 12, tierName: 'Find B', canonicalText: 'Twin B', submittedText: 'alias b', diveBand: 'medium',
    } });
    expect(s.player(e)).toMatchObject({ ownResult: { points: largeAward, tierName: 'Ordinary', diveBand: 'high' } });
    expect(s.player(f)).toMatchObject({ ownResult: { points: 10, tierName: 'Rare', diveBand: 'low' } });
    for (const playerId of [c, d]) expect(s.player(playerId)).not.toHaveProperty('ownResult.diveBand');
    expect(JSON.stringify(s.host())).not.toContain('diveBand');

    s.expire(); s.expire();
    expect(s.answer(a, 'Twin A').ok).toBe(true);
    expect(s.answer(f, 'Small').ok).toBe(true);
    s.expire();
    expect(s.player(a)).toMatchObject({ ownResult: { points: 12, diveBand: 'high' } });
    expect(s.player(f)).toMatchObject({ ownResult: { points: 10, diveBand: 'low' } });
    s.expire();
    const final = s.player(a);
    expect(final).toMatchObject({ phase: 'Finished', rounds: [
      { ownResult: { points: 12, tierName: 'Find A' } },
      { ownResult: { points: 12, tierName: 'Find A' } },
    ] });
    expect(JSON.stringify(final)).not.toContain('diveBand');
  });

  it('accepts older Results and restricts the optional band to positive personal awards in Results', () => {
    const s = scenario(); s.commit();
    const a = s.add('Ada'); const b = s.add('Bo'); const c = s.add('Cal');
    s.start(); s.expire();
    expect(s.answer(a, 'Ink fin').ok).toBe(true);
    expect(s.answer(b, 'Haddock').ok).toBe(true);
    s.expire();

    const positive = s.player(a);
    const zero = s.player(b);
    const missed = s.player(c);
    if (positive.phase !== 'Results' || positive.ownResult.outcome !== 'accepted' ||
        zero.phase !== 'Results' || missed.phase !== 'Results') throw new Error('Expected player Results');
    const { diveBand, ...oldResult } = positive.ownResult;
    expect(diveBand).toBe('medium');
    expect(completeView.safeParse({ ...positive, ownResult: oldResult }).success).toBe(true);
    expect(completeView.safeParse({ ...positive, ownResult: { ...oldResult, diveBand: 'extreme' } }).success).toBe(false);
    for (const view of [zero, missed]) {
      expect(completeView.safeParse({ ...view, ownResult: { ...view.ownResult, diveBand: 'medium' } }).success).toBe(false);
    }

    while (s.engine.state().phase !== 'Finished') s.expire();
    const final = s.player(a);
    if (final.phase !== 'Finished') throw new Error('Expected Finished');
    const [first, ...later] = final.rounds;
    expect(completeView.safeParse({ ...final, rounds: [
      { ...first, ownResult: { ...first.ownResult, diveBand: 'medium' } },
      ...later,
    ] }).success).toBe(false);
  });

  it('retains disconnected members, denies removed or unknown players, and excludes removed standings', () => {
    const s = scenario(); s.commit();
    const a = s.add('Ada'); const b = s.add('Bo');
    s.start(); s.expire(); s.answer(a, 'Ink fin');
    s.engine.disconnect(s.engine.state().gameId!, b);
    expect(s.host()).toMatchObject({ readiness: { accepted: 1, eligible: 2 } });
    s.engine.remove(s.engine.state().gameId!, a);
    expect(s.host()).toMatchObject({ readiness: { accepted: 0, eligible: 1 } });
    expect(() => s.player(a)).toThrow('REMOVED');
    expect(() => s.player('not-a-member')).toThrow('PLAYER_NOT_FOUND');
    s.expire();
    const view = s.host();
    expect(view).toMatchObject({ results: { groups: [{ canonicalText: privatePackMarker, count: 1 }] } });
    expect(JSON.stringify(view)).not.toContain('Ada');
    expect(completeView.safeParse(view).success).toBe(true);
    s.engine.remove(s.engine.state().gameId!, b);
    expect(s.host()).toMatchObject({ standings: [], roster: [] });
  });

  it('accepts maximum-length text without truncation in every phase', () => {
    const s = scenario(longTextPack()); s.commit(); const p = s.add('N'.repeat(32));
    expect(s.player(p)).toMatchObject({ title: '🐟'.repeat(256) });
    s.start();
    expect(s.player(p)).toMatchObject({ prompt: 'p'.repeat(4096) });
    s.expire(); s.answer(p, 'a'.repeat(512));
    expect(s.player(p)).toMatchObject({ ownResult: { canonicalText: '🐟'.repeat(512), submittedText: 'a'.repeat(512) } });
    while (s.engine.state().phase !== 'Finished') {
      expect(completeView.safeParse(s.host()).success).toBe(true);
      expect(completeView.safeParse(s.player(p)).success).toBe(true);
      s.expire();
    }
    expect(completeView.safeParse(s.host()).success).toBe(true);
    expect(completeView.safeParse(s.player(p)).success).toBe(true);
  });

  it('returns detached views whose mutation cannot affect the engine or another view', () => {
    const s = scenario(); s.commit(); const p = s.add('Ada');
    const view = s.host();
    if (view.phase !== 'Lobby') throw new Error('Expected Lobby');
    view.roster[0]!.nickname = 'Changed';
    view.packSummary.tiers[0]!.points = 900;
    expect(s.player(p)).toMatchObject({ ownPlayer: { nickname: 'Ada' } });
    expect(s.host()).toMatchObject({ packSummary: { tiers: [{ points: 50 }, { points: 0 }] } });
  });

  it('exposes exhausted admission history without counting removed players as an active roster', () => {
    const s = scenario(); s.commit();
    const survivor = s.add('Survivor');
    const gameId = s.engine.state().gameId!;
    for (let i = 0; i < 999; i++) {
      const admission = s.engine.admit({ gameId, identityId: 'visitor-' + i, nickname: 'Visitor' });
      if (!admission.ok) throw new Error(admission.code);
      expect(s.engine.remove(gameId, admission.playerId).ok).toBe(true);
    }
    expect(s.host()).toMatchObject({ admissionHistoryFull: true, roster: [{ nickname: 'Survivor' }], canStart: true });
    expect(s.player(survivor)).toMatchObject({ admittedCount: 1 });
    expect(completeView.safeParse(s.host()).success).toBe(true);
  });

  it('finishes an emptied game with no winners while retaining its accepted aggregate results', () => {
    const s = scenario(); s.commit(); const a = s.add('Ada'); const b = s.add('Bo');
    s.start(); s.expire(); s.answer(a, 'Ink fin');
    const firstRound = s.engine.state().roundId!;
    s.engine.remove(s.engine.state().gameId!, a);
    s.engine.remove(s.engine.state().gameId!, b);
    expect(s.host()).toMatchObject({ phase: 'Answering', readiness: { accepted: 0, eligible: 0 }, publishedStandings: [] });
    while (s.engine.state().phase !== 'Finished') s.expire();
    expect(s.host({ requestedRoundId: firstRound })).toMatchObject({
      phase: 'Finished', standings: [], winnerIds: [],
      requestedDetail: { results: { groups: [{ canonicalText: privatePackMarker, count: 1 }] } },
    });
    expect(completeView.safeParse(s.host()).success).toBe(true);
    expect(() => s.player(a)).toThrow('REMOVED');
  });
});
