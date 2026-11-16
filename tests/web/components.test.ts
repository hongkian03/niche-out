import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnswerGroups, RoundRecaps, Standings, Timer, formatRemaining,
  type PublicResults, type RecapRound, type Standing,
} from '../../apps/web/src/components.js';

afterEach(() => vi.restoreAllMocks());

describe('server-deadline timer presentation', () => {
  it.each([
    [-1, '0'], [0, '0'], [1, '1'], [999, '1'], [1000, '1'], [1001, '2'],
    [59000, '59'], [59001, '1:00'], [59999, '1:00'], [60000, '1:00'], [60001, '1:01'], [600000, '10:00'],
  ])('rounds %i ms upward without granting extra time', (milliseconds, label) => {
    expect(formatRemaining(milliseconds)).toBe(label);
  });
  it('uses corrected server time for its number, warning, and closing status', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100000);
    const warning = renderToStaticMarkup(createElement(Timer, { deadlineMs: 106000, clockOffsetMs: 1500, label: 'Answers open in', phaseId: 'reading' }));
    expect(warning).toContain('<span>5</span>');
    expect(warning).toContain('timer-warning');
    expect(warning).toContain('Five seconds or less remaining.');
    const closing = renderToStaticMarkup(createElement(Timer, { deadlineMs: 101000, clockOffsetMs: 1500, label: 'Time remaining', phaseId: 'answering' }));
    expect(closing).toContain('<span>0</span>');
    expect(closing).toContain('Closing phase. Synchronizing with the server.');
    expect(closing).not.toContain('miss');
    expect(closing).not.toContain('accepted');
  });
  it('handles a monotonic server clock with a very different epoch from the browser', () => {
    const browserNow = 1800000000000, serverNow = 4000;
    vi.spyOn(Date, 'now').mockReturnValue(browserNow);
    const html = renderToStaticMarkup(createElement(Timer, {
      deadlineMs: serverNow + 61000, clockOffsetMs: serverNow - browserNow, phaseId: 'long-answering',
    }));
    expect(html).toContain('<span>1:01</span>');
    expect(html).toContain(': 61 seconds');
    expect(html).not.toContain('1:01 seconds');
    expect(html).not.toContain('Closing phase');
  });
});

describe('anonymous public answer summaries', () => {
  it('preserves authoritative order, including equal-point JSON order and accepted zero-point rows', () => {
    const html = renderToStaticMarkup(createElement(AnswerGroups, { results: {
      groups: [
        { canonicalText: 'Zeta', tierName: 'Deep cut', points: 100, count: 1 },
        { canonicalText: 'Alpha', tierName: 'Another name', points: 100, count: 3 },
        { canonicalText: 'Ordinary', tierName: 'Valid zero', points: 0, count: 1000 },
      ], unused: null,
    } }));
    expect(html.indexOf('Zeta')).toBeLessThan(html.indexOf('Alpha'));
    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('Ordinary'));
    expect(html).toContain('Valid zero · 0 points');
    // Retained removed-player answers can exceed the current roster. The view owns the count.
    expect(html).toContain('1000<small>answers');
    expect(html).not.toContain('Nobody chose this');
  });
  it('shows the unused example even when nobody submitted a valid answer', () => {
    const html = renderToStaticMarkup(createElement(AnswerGroups, { results: {
      groups: [], unused: { canonicalText: 'Autumn', tierName: 'Rare', points: 100 },
    } }));
    expect(html).toContain('No accepted answers this round.');
    expect(html).toContain('Nobody chose this');
    expect(html).toContain('Autumn');
    expect(html).not.toContain('answer-count');
  });
  it('does not synthesize a replacement example when all accepted answers were used', () => {
    const html = renderToStaticMarkup(createElement(AnswerGroups, { results: {
      groups: [{ canonicalText: 'Only answer', tierName: 'Any tier', points: 0, count: 2 }], unused: null,
    } }));
    expect(html).not.toContain('Nobody chose this');
    expect(html).not.toContain('No accepted answers');
  });
  it('does not expose individual answer authors or interpret imported markup', () => {
    const contaminated = {
      groups: [{ canonicalText: '<img src=x onerror=bad()>', tierName: '<script>bad()</script>', points: 5, count: 2,
        players: [{ nickname: 'PRIVATE_PLAYER_IDENTITY' }] }],
      unused: { canonicalText: '<b>Unused</b>', tierName: 'Unlisted <em>style</em>', points: 10 },
    };
    const html = renderToStaticMarkup(createElement(AnswerGroups, { results: contaminated }));
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Unused&lt;/b&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('PRIVATE_PLAYER_IDENTITY');
    expect(html).not.toContain('players');
  });
});

describe('standings across ties and a large room', () => {
  const rows: Standing[] = Array.from({ length: 10 }, (_, i) => ({
    playerId: `p${i + 1}`, nickname: `Crew member ${i + 1}`, rank: i < 2 ? 1 : i + 1,
    publishedTotal: i < 2 ? 100 : 100 - i, roundPoints: i < 2 ? 100 : 100 - i,
  }));
  it('shows the leading five and a player outside that group without changing ranks', () => {
    const html = renderToStaticMarkup(createElement(Standings, { rows, ownPlayerId: 'p8', limit: 5 }));
    expect(html).toContain('Crew member 5');
    expect(html).not.toContain('Crew member 6');
    expect(html).not.toContain('Crew member 7');
    expect(html).toContain('Crew member 8');
    expect(html).not.toContain('Crew member 9');
    expect(html.match(/class="rank">1<\/td>/g)).toHaveLength(2);
    expect(html).toContain('class="rank">3</td>');
    expect(html).toContain('class="rank">8</td>');
    expect(html).toContain('you-label">You');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Show all 10 players');
  });
  it('does not duplicate the own row when already in the leading group', () => {
    const html = renderToStaticMarkup(createElement(Standings, { rows, ownPlayerId: 'p2', limit: 5 }));
    expect(html.match(/Crew member 2/g)).toHaveLength(1);
    expect(html.match(/you-label/g)).toHaveLength(1);
    expect(html).not.toContain('Crew member 6');
  });
  it('keeps maximum safe integer scores as complete text and preserves a distinct round column', () => {
    const html = renderToStaticMarkup(createElement(Standings, { rows: [
      { playerId: 'p1', nickname: 'High scorer', rank: 1, publishedTotal: Number.MAX_SAFE_INTEGER, roundPoints: 0 },
    ] }));
    expect(html).toContain('9007199254740991');
    expect(html).toContain('<th scope="col">Round</th>');
    expect(html).toContain('<td>+0</td>');
    expect(html).not.toMatch(/9\.007|e\+15/);
  });
  it('omits a round score column from final standings and presents empty rooms truthfully', () => {
    const final = renderToStaticMarkup(createElement(Standings, { rows: [{ playerId: 'p1', nickname: 'Solo', rank: 1, publishedTotal: 0 }] }));
    expect(final).not.toContain('<th scope="col">Round</th>');
    expect(final).toContain('scope="row"');
    const empty = renderToStaticMarkup(createElement(Standings, { rows: [] }));
    expect(empty).toContain('No players remaining');
    expect(empty).not.toContain('winner');
  });
});

describe('aggregate versus personal final recaps', () => {
  const cache: Record<string, PublicResults> = { r1: {
    groups: [{ canonicalText: 'Autumn', tierName: 'Rare', points: 100, count: 2 }],
    unused: { canonicalText: 'Winter', tierName: 'Rare', points: 100 },
  } };
  it('renders host aggregate details with no fabricated personal answer or score', () => {
    const onRequest = vi.fn();
    const html = renderToStaticMarkup(createElement(RoundRecaps, {
      rounds: [{ roundId: 'r1', roundIndex: 0, prompt: 'Name a season.' }], cache, onRequest,
    }));
    expect(html).toContain('Round 1');
    expect(html).toContain('Name a season.');
    expect(html).toContain('Autumn');
    expect(html).toContain('Nobody chose this');
    expect(html).not.toContain('Your answer');
    expect(html).not.toContain('You entered');
    expect(html).not.toContain('recap-points');
    expect(onRequest).not.toHaveBeenCalled();
  });
  it('renders the authorized own answer with alias and preserves miss versus accepted zero', () => {
    const rounds: RecapRound[] = [
      { roundId: 'r1', roundIndex: 0, prompt: 'Name a season.', ownResult: {
        outcome: 'accepted', canonicalText: 'Autumn', submittedText: 'Fall', tierName: 'Valid zero', points: 0,
      } },
      { roundId: 'r2', roundIndex: 1, prompt: 'Name a colour.', ownResult: { outcome: 'miss', points: 0 } },
    ];
    const onRequest = vi.fn();
    const html = renderToStaticMarkup(createElement(RoundRecaps, { rounds, cache, onRequest }));
    expect(html).toContain('You entered: Fall');
    expect(html).toContain('Valid zero · +0');
    expect(html).toContain('No accepted answer · +0');
    expect(html).toContain('Retry round details');
    expect(onRequest).not.toHaveBeenCalled();
  });
  it('keeps long imported prompts intact and escapes markup rather than emitting hidden HTML', () => {
    const prompt = '<svg onload=bad()>' + 'x'.repeat(4000);
    const html = renderToStaticMarkup(createElement(RoundRecaps, { rounds: [{ roundId: 'r1', roundIndex: 0, prompt }], cache: {}, onRequest: vi.fn() }));
    expect(html).toContain('&lt;svg onload=bad()&gt;' + 'x'.repeat(4000));
    expect(html).not.toContain('<svg');
  });
});
