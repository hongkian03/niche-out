import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { completeView, type CompleteView } from '@rarity/contracts';
import { Player, PersonalOutcome } from '../../apps/web/src/Player.js';
import type { ClientSnapshot, GameClient } from '../../apps/web/src/client.js';
import {
  estimatedRemainingMs, initialInvitationCode, playerErrorMessage, validateAnswer, validateJoin,
} from '../../apps/web/src/player-helpers.js';

const client = { join: vi.fn(), submit: vi.fn(), claimControl: vi.fn(), recap: vi.fn(), retry: vi.fn() } as unknown as GameClient;
const base = { protocolVersion: 2 as const, serverInstanceId: 'server', gameId: 'game', revision: 2, phaseId: 'phase', serverNowMs: Date.now(), promptCount: 2 };
const player = { playerId: 'p1', nickname: 'Diver' };
const common = { ...base, viewRole: 'player' as const, ownPlayer: player };
const standings = [
  { ...player, rank: 1, publishedTotal: 100 },
  { playerId: 'p2', nickname: 'Sailor', rank: 1, publishedTotal: 100 },
];
const result = { outcome: 'accepted' as const, canonicalText: 'Autumn', submittedText: 'Fall', tierName: 'Rare', points: 100 };
const results = { groups: [{ canonicalText: 'Autumn', tierName: 'Rare', points: 100, count: 2 }], unused: { canonicalText: 'Winter', tierName: 'Rare', points: 100 } };

function state(view: CompleteView | null = null, patch: Partial<ClientSnapshot> = {}): ClientSnapshot {
  return {
    session: { protocolVersion: 2, serverInstanceId: 'server', tabId: 'tab', requestPrefix: 'prefix', role: 'guest', membership: null, resume: 'none', hostGameId: null, lastGameCommit: null },
    view, status: 'connected', error: null, pending: null, candidate: null, controlGeneration: 1,
    clockOffsetMs: 0, answerFeedback: null, recapCache: {}, ...patch,
  };
}
function live(patch: Record<string, unknown> = {}): CompleteView {
  return completeView.parse({ ...common, phase: 'Answering', roundId: 'round1', roundIndex: 0,
    prompt: 'Name a season.', phaseDeadlineMs: Date.now() + 60000, readiness: { accepted: 0, eligible: 2 },
    ownAnswer: { locked: false, submittedText: null }, controlGeneration: 1, publishedTotal: 0, ...patch });
}
function markup(snapshot: ClientSnapshot) { return renderToStaticMarkup(createElement(Player, { client, state: snapshot })); }

describe('player input contracts', () => {
  it('preserves leading zeroes and pre-fills without admitting', () => {
    expect(initialInvitationCode('?code=000042')).toBe('000042');
    expect(initialInvitationCode('?code=wrong')).toBe('wrong');
    expect(initialInvitationCode('')).toBe('');
    expect(validateJoin(' 000042 ', 'Diver')).toEqual({});
    expect(validateJoin('42', 'Diver').code).toMatch(/six-digit/);
    expect(validateJoin('１２３４５６', 'Diver').code).toBeTruthy();
    expect(client.join).not.toHaveBeenCalled();
  });
  it('checks nickname limits after server-defined space normalization', () => {
    expect(validateJoin('000042', ' \t\n ').nickname).toBe('Enter a nickname.');
    expect(validateJoin('000042', '  A   B  ')).toEqual({});
    expect(validateJoin('000042', `   ${'A'.repeat(32)}   `)).toEqual({});
    expect(validateJoin('000042', 'A'.repeat(33)).nickname).toBeTruthy();
    expect(validateJoin('000042', '🌊'.repeat(32))).toEqual({});
    expect(validateJoin('000042', '🌊'.repeat(33)).nickname).toBeTruthy();
  });
  it('validates raw answer length in code points without guessing a matching answer', () => {
    expect(validateAnswer(' \t\n ')).toBe('Enter an answer.');
    expect(validateAnswer('not in the uploaded answer bank')).toBeNull();
    expect(validateAnswer('🌊'.repeat(512))).toBeNull();
    expect(validateAnswer('🌊'.repeat(513))).toMatch(/512/);
    expect(validateAnswer('x'.repeat(511) + '  ')).toMatch(/512/);
  });
  it('uses the sampled server offset and clamps display time without scoring', () => {
    expect(estimatedRemainingMs(2000, 250, 1500)).toBe(250);
    expect(estimatedRemainingMs(2000, -250, 1500)).toBe(750);
    expect(estimatedRemainingMs(2000, 250, 1750)).toBe(0);
    expect(estimatedRemainingMs(2000, 250, 9000)).toBe(0);
  });
});

describe('player admission and recovery presentation', () => {
  it('does not display admission fields until discovery establishes a guest session', () => {
    const checking = markup(state(null, { session: null, status: 'discovering' }));
    expect(checking).toContain('Rejoining game');
    expect(checking).not.toContain('name="nickname"');
    const guest = markup(state());
    expect(guest).toContain('name="nickname"');
    expect(guest).toContain('inputMode="numeric"');
    expect(guest).toContain('type="text"');
  });
  it('shows the admitted identity and waiting count without a Ready action', () => {
    const view = completeView.parse({ ...common, phase: 'Lobby', title: 'Seasons', roundId: null,
      roundIndex: null, phaseDeadlineMs: null, admittedCount: 2, connection: 'disconnected' });
    const html = markup(state(view));
    expect(html).toContain('Diver');
    expect(html).toContain('2 of 100 players admitted');
    expect(html).toContain('Waiting for the host to start');
    expect(html).not.toContain('name="nickname"');
    expect(html).not.toMatch(/<button[^>]*>Ready/);
  });
  it.each([
    ['NO_LOBBY', 'No game is open'], ['GAME_FULL', 'This game is full'],
    ['ENTRY_CLOSED', 'already started'], ['GAME_FINISHED', 'has ended'],
    ['NICKNAME_TAKEN', 'nickname is already in use'], ['GAME_NOT_FOUND', 'Game not found'],
    ['ADMISSION_HISTORY_LIMIT', 'history limit'], ['SESSION_CAPACITY', 'temporarily busy'],
    ['HANDSHAKE_CAPACITY', 'temporarily busy'], ['PAGE_CAPACITY', 'Too many pages'],
  ])('distinguishes %s from unrelated admission failures', (code, text) => {
    expect(playerErrorMessage({ code, message: 'server detail' })).toContain(text);
    expect(markup(state(null, { error: { code, message: 'server detail' } }))).toContain(text);
  });
  it('does not call a rate limit an answer-list rejection', () => {
    expect(playerErrorMessage({ code: 'RATE_LIMITED', message: 'wait' })).toContain('has not been rejected');
  });
  it('offers explicit takeover on supersession without admitting or taking control during render', () => {
    const html = markup(state(live(), { status: 'superseded' }));
    expect(html).toContain('Take control here');
    expect(html).toContain('active in another tab');
    expect(html.match(/<input[^>]*name="answer"[^>]*>/)?.[0]).toContain('disabled=""');
    expect(client.claimControl).not.toHaveBeenCalled();
  });
  it('replaces the gameplay view for removed and closed identities', () => {
    const removed = markup(state(live(), { status: 'removed' }));
    expect(removed).toContain('You were removed');
    expect(removed).not.toContain('name="answer"');
    const closed = markup(state(live(), { status: 'closed' }));
    expect(closed).toContain('no longer available');
    expect(closed).toContain('href="/join"');
  });
});

describe('round privacy and truthful outcomes', () => {
  it('renders a locked answer with neutral acceptance and the previously published score only', () => {
    const html = markup(state(live({ ownAnswer: { locked: true, submittedText: 'Fall' }, readiness: { accepted: 1, eligible: 2 } })));
    expect(html).toContain('Answer accepted');
    expect(html).toContain('locked-answer">Fall');
    expect(html).toContain('1 of 2 answers submitted');
    expect(html).toContain('0 points');
    expect(html).not.toContain('Rare');
    expect(html).not.toContain('Autumn');
    expect(html).not.toContain('+100');
  });
  it('shows uncertainty and never manufactures acceptance from a pending answer', () => {
    const html = markup(state(live(), { pending: { kind: 'answer', label: 'Confirming' },
      answerFeedback: { roundId: 'round1', status: 'confirming', submittedText: 'Fall' } }));
    expect(html).toContain('Confirming your answer');
    expect(html).not.toContain('Answer accepted');
    expect(html).toContain('value="Fall"');
  });
  it('ignores feedback for a different round', () => {
    const html = markup(state(live(), { answerFeedback: { roundId: 'earlier-round', status: 'accepted', submittedText: 'Secret earlier draft' } }));
    expect(html).not.toContain('Secret earlier draft');
    expect(html).not.toContain('Answer accepted');
  });
  it('shows closing at local zero without inventing a miss or grace period', () => {
    const html = markup(state(live({ phaseDeadlineMs: Date.now() - 1000 })));
    expect(html).toContain('Closing round');
    expect(html).toContain('readOnly=""');
    expect(html).not.toContain('No accepted answer');
    expect(html).not.toContain('Answer accepted');
  });
  it('freezes offline entry while retaining the in-page recovery explanation', () => {
    const html = markup(state(live(), { status: 'reconnecting' }));
    expect(html).toContain('draft is kept on this page');
    expect(html.match(/<input[^>]*name="answer"[^>]*>/)?.[0]).toContain('disabled=""');
  });
  it('escapes imported prompt and locked answer markup', () => {
    const html = markup(state(live({ prompt: '<script>bad()</script>', ownAnswer: { locked: true, submittedText: '<img src=x onerror=bad()>' }, readiness: { accepted: 1, eligible: 2 } })));
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
  });
  it('distinguishes a valid zero-point answer from a miss', () => {
    const accepted = renderToStaticMarkup(createElement(PersonalOutcome, { result: { ...result, tierName: 'No points', points: 0 } }));
    const miss = renderToStaticMarkup(createElement(PersonalOutcome, { result: { outcome: 'miss', points: 0 } }));
    expect(accepted).toContain('Accepted answer · 0 points');
    expect(accepted).toContain('No points');
    expect(accepted).not.toContain('No accepted answer');
    expect(miss).toContain('No accepted answer');
    expect(miss).not.toContain('Autumn');
  });
  it('reveals aliases, counts, tied standings, and default Answers tabs only in Results', () => {
    const view = completeView.parse({ ...common, phase: 'Results', roundId: 'round1', roundIndex: 0,
      prompt: 'Name a season.', phaseDeadlineMs: Date.now() + 10000, ownResult: result, results,
      standings: standings.map(row => ({ ...row, roundPoints: 100 })) });
    const html = markup(state(view));
    expect(html).toContain('Autumn');
    expect(html).toContain('You submitted: Fall');
    expect(html).toContain('Nobody chose this');
    expect(html).toContain('aria-controls="answers-panel" aria-selected="true"');
    expect(html).toContain('aria-controls="standings-panel" aria-selected="false"');
    const grouped = html.slice(html.indexOf('class="answer-groups"'), html.indexOf('id="standings-panel"'));
    expect(grouped).not.toContain('Diver');
    expect(grouped).not.toContain('Sailor');
    expect(html).not.toContain('Your round recap');
  });
  it('renders the complete private final recap and all joint winners without fetching during render', () => {
    const view = completeView.parse({ ...common, phase: 'Finished', roundId: null, roundIndex: null, phaseDeadlineMs: null,
      standings, winnerIds: ['p1', 'p2'], requestedDetail: null, rounds: [
        { roundId: 'round1', roundIndex: 0, prompt: 'Name a season.', ownResult: result },
        { roundId: 'round2', roundIndex: 1, prompt: 'Name a colour.', ownResult: { outcome: 'miss', points: 0 } },
      ] });
    const html = markup(state(view));
    expect(html).toContain('Joint winners');
    expect(html).toContain('Rank 1');
    expect(html).toContain('Your round recap');
    expect(html).toContain('You submitted: Fall');
    expect(html).toContain('No accepted answer');
    expect(client.recap).not.toHaveBeenCalled();
  });
});
