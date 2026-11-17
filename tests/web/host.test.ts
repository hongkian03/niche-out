import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { completeView, invitationForOrigin, type CompleteView } from '@rarity/contracts';
import { Host, HostConnectionNotice, HostInvitation, HostPackSummary, HostRosterList } from '../../apps/web/src/Host.js';
import { filterHostRoster, formatFieldPath, hostHasPlayer, type HostRoster, type HostView } from '../../apps/web/src/host-helpers.js';
import type { Candidate, ClientSnapshot, GameClient } from '../../apps/web/src/client.js';

const origin = 'https://niche.example.com';
const hosting = { status: 'ready', publicOrigin: origin } as const;
const base = { protocolVersion: 2, serverInstanceId: 'instance', revision: 4, phaseId: 'phase', serverNowMs: 1000, viewRole: 'host' } as const;
const inactive = { roundId: null, roundIndex: null, phaseDeadlineMs: null };
const summary = { title: 'Season Picks', promptCount: 2,
  tiers: [{ name: 'Rare finds', points: 100 }, { name: 'Accepted zero', points: 0 }],
  settings: { readingSeconds: 3, answerSeconds: 25, resultsSeconds: 10 } };
const roster: HostRoster = [
  { playerId: 'first', nickname: 'Mina', connection: 'connected' },
  { playerId: 'second', nickname: 'ann A', connection: 'disconnected' },
  { playerId: 'third', nickname: 'Anna', connection: 'connected' },
];
const setup = completeView.parse({ ...base, ...inactive, phase: 'Setup', gameId: null, promptCount: 0, hosting, setupGeneration: 0 }) as HostView;
const lobby = completeView.parse({ ...base, ...inactive, phase: 'Lobby', gameId: 'game', promptCount: 2, hosting, setupGeneration: 1,
  invitation: invitationForOrigin(origin, '000123'), packSummary: summary, roster, canStart: true, canReplace: true, admissionHistoryFull: false }) as Extract<HostView, { phase: 'Lobby' }>;
const live = completeView.parse({ ...base, phase: 'Answering', gameId: 'game', promptCount: 2, hosting,
  roundId: 'round-1', roundIndex: 0, prompt: 'Name a season.', phaseDeadlineMs: 26000,
  readiness: { accepted: 1, eligible: 3 }, roster, publishedStandings: [] }) as Extract<HostView, { phase: 'Reading' | 'Answering' }>;
const results = { groups: [{ canonicalText: 'Autumn', tierName: 'Rare finds', points: 100, count: 2 }],
  unused: { canonicalText: 'Winter', tierName: 'Rare finds', points: 100 } };
const standings = [{ playerId: 'first', nickname: 'Mina', rank: 1, publishedTotal: 200 }, { playerId: 'second', nickname: 'ann A', rank: 1, publishedTotal: 200 }];
const finished = completeView.parse({ ...base, ...inactive, phase: 'Finished', gameId: 'game', promptCount: 2, hosting, setupGeneration: 1,
  standings, winnerIds: ['first', 'second'], requestedDetail: null,
  rounds: [{ roundId: 'round-1', roundIndex: 0, prompt: 'Name a season.' }, { roundId: 'round-2', roundIndex: 1, prompt: 'Name a colour.' }] }) as Extract<HostView, { phase: 'Finished' }>;
const candidate: Candidate = { serverInstanceId: 'instance', candidateId: 'candidate', expectedGameId: null, expectedSetupGeneration: 0, summary };
const client = { retry: vi.fn(), clearError: vi.fn(), discardCandidate: vi.fn(), upload: vi.fn(), commit: vi.fn(), start: vi.fn(), remove: vi.fn(), recap: vi.fn() } as unknown as GameClient;
function state(view: CompleteView, overrides: Partial<ClientSnapshot> = {}): ClientSnapshot {
  return { view, session: null, status: 'connected', error: null, pending: null, candidate: null, controlGeneration: null,
    clockOffsetMs: 0, answerFeedback: null, recapCache: {}, ...overrides };
}
function screen(view: CompleteView, overrides: Partial<ClientSnapshot> = {}) {
  return renderToStaticMarkup(createElement(Host, { client, state: state(view, overrides) }));
}
const startButton = (html: string) => html.match(/<button[^>]*>Start game<\/button>/)?.[0];

describe('host roster identity and presentation', () => {
  it('filters normalized nicknames without sorting or mutating admission order', () => {
    expect(filterHostRoster(roster, '  ANN ')).toEqual([roster[1], roster[2]]);
    expect(filterHostRoster(roster, 'ANN   A')).toEqual([roster[1]]);
    expect(filterHostRoster(roster, ' ')).toBe(roster);
    expect(roster.map(player => player.playerId)).toEqual(['first', 'second', 'third']);
  });

  it('keeps the full admitted count and disconnected status while filtering a 100-player roster', () => {
    const many: HostRoster = Array.from({ length: 100 }, (_, index) => ({ playerId: `p-${index}`, nickname: `Crew ${String(index).padStart(3, '0')}`,
      connection: index === 99 ? 'disconnected' : 'connected' }));
    const html = renderToStaticMarkup(createElement(HostRosterList, { roster: many, query: '099', onQuery: vi.fn(), onRemove: vi.fn() }));
    expect(html).toContain('<strong>100</strong> / 100 admitted');
    expect(html).toContain('1 match');
    expect(html).toContain('Disconnected · place kept');
    expect(html).toContain('data-player-id="p-99"');
    expect(html).not.toContain('data-player-id="p-98"');
    expect(html).toContain('This game is full');
  });

  it('shows a clear zero-match state without confusing it with an empty lobby', () => {
    const html = renderToStaticMarkup(createElement(HostRosterList, { roster, query: 'nobody', onQuery: vi.fn(), onRemove: vi.fn() }));
    expect(html).toContain('No players match this search.');
    expect(html).toContain('Clear search');
    expect(html).not.toContain('No players yet');
    expect(html).toContain('<strong>3</strong> / 100 admitted');
  });

  it('validates an existing removal target by ID through reorder, removal, and Finished', () => {
    expect(hostHasPlayer({ ...lobby, roster: [...roster].reverse() }, 'second')).toBe(true);
    expect(hostHasPlayer({ ...lobby, roster: roster.filter(player => player.playerId !== 'second') }, 'second')).toBe(false);
    expect(hostHasPlayer(finished, 'second')).toBe(true);
    expect(hostHasPlayer(finished, 'third')).toBe(false);
    expect(hostHasPlayer(setup, 'second')).toBe(false);
  });
});

describe('host setup and invitation boundaries', () => {
  it('shows the complete reviewed tier/timer summary and an explicit commit action', () => {
    const html = screen(setup, { candidate });
    expect(html).toContain('Create lobby');
    expect(html).toContain('Season Picks');
    expect(html).toContain('Accepted zero');
    expect(html).toContain('0 points');
    expect(html).toContain('25 seconds');
    expect(html).not.toContain('Start game');
    expect(html).not.toContain('Autumn');
    expect(client.commit).not.toHaveBeenCalled();
  });

  it('renders imported text literally and never turns it into markup', () => {
    const title = '<img src=x onerror=alert(1)>';
    const html = screen(setup, { candidate: { ...candidate, summary: { ...summary, title, tiers: [{ name: '<script>bad()</script>', points: 1 }] } } });
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img src=x');
  });

  it('warns clearly before a replacement and exposes field-specific validation errors', () => {
    const warning = renderToStaticMarkup(createElement(HostPackSummary, { candidate, replacing: true }));
    expect(warning).toContain('Everyone must rejoin, and previous results will be cleared.');
    const html = screen(setup, { error: { code: 'INVALID_PACK', message: 'The file contains errors.', fieldErrors: [
      { path: ['prompts', 2, 'answers', 1, 'tierId'], message: 'Unknown tier.' },
    ] } });
    expect(html).toContain('prompts[2].answers[1].tierId');
    expect(html).toContain('Unknown tier.');
    expect(formatFieldPath([])).toBe('Game file');
    expect(html).not.toContain('Create lobby');
  });

  it('locks creation for expired candidates and uncertain commits', () => {
    const expired = screen(setup, { candidate, error: { code: 'CANDIDATE_EXPIRED', message: 'Candidate expired.' } });
    expect(expired).toMatch(/<button[^>]*disabled=""[^>]*>Create lobby<\/button>/);
    expect(expired).toContain('Choose the file again');
    const pending = screen(setup, { candidate, pending: { kind: 'commit', label: 'Confirming game…' } });
    expect(pending).toContain('Confirming game…');
    expect(pending).not.toContain('Creation failed');
    expect(pending).toMatch(/<input[^>]*type="file"[^>]*disabled=""/);
  });

  it('shares a public code-prefilled invitation with preserved leading zeroes only when ready', () => {
    const invitation = invitationForOrigin(origin, '000123');
    const html = renderToStaticMarkup(createElement(HostInvitation, { invitation, ready: true }));
    expect(html).toContain('>000123</span>');
    expect(html).toContain('Game code 0 0 0 1 2 3');
    expect(html).toContain('href="https://niche.example.com/join?code=000123"');
    expect(html).toContain('Internet required.');
    expect(html).not.toContain('/host');
    expect(html).not.toContain('qrserver');
    const waiting = renderToStaticMarkup(createElement(HostInvitation, { invitation, ready: false }));
    expect(waiting).not.toContain('href=');
    expect(waiting).not.toContain('Copy join link');
  });
});

describe('host current game, recovery, and private boundaries', () => {
  it('allows one-click Start only while authoritative readiness and browser connection allow it', () => {
    expect(startButton(screen(lobby))).not.toContain('disabled');
    expect(startButton(screen({ ...lobby, canStart: false, roster: [] }))).toContain('disabled');
    expect(startButton(screen({ ...lobby, canStart: false, hosting: { status: 'reconnecting', publicOrigin: origin } }))).toContain('disabled');
    expect(startButton(screen(lobby, { status: 'reconnecting' }))).toContain('disabled');
    expect(screen(lobby)).toContain('Starting closes entry to new players.');
    expect(screen(lobby)).not.toContain('Ready to play');
  });

  it('keeps Start and operation errors visible without erasing the confirmed lobby', () => {
    const html = screen(lobby, { error: { code: 'HOSTING_NOT_READY', message: 'Hosting is not ready.' } });
    expect(html).toContain('Hosting is not ready.');
    expect(html).toContain('Season Picks');
    expect(html).toContain('000123');
    expect(html).toContain('Dismiss message');
  });

  it('shows current readiness but never an answer input, hidden answer text, or extra gameplay controls', () => {
    const html = screen(live);
    expect(html).toContain('Name a season.');
    expect(html).toContain('<strong>1</strong> of 3 answers locked');
    expect(html).toContain('Manage players');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('Autumn');
    for (const label of ['Pause', 'Skip round', 'End game', 'Your answer']) expect(html).not.toContain(label);
  });

  it('retains the last view and directs host recovery through the local launcher', () => {
    const html = screen(lobby, { status: 'host-revoked' });
    expect(html).toContain('Use Open host page in the local launcher');
    expect(html).toContain('The game keeps running.');
    expect(startButton(html)).toContain('disabled');
    const reconnect = renderToStaticMarkup(createElement(HostConnectionNotice, { client, state: state(lobby, { status: 'reconnecting' }) }));
    expect(reconnect).toContain('last confirmed view');
    expect(reconnect).toContain('Retry connection');
  });

  it('renders equal joint winners and only aggregate final recap content', () => {
    const html = screen(finished, { recapCache: { 'round-1': results } });
    expect(html).toContain('Joint winners');
    expect(html).toContain('<strong>Mina</strong><span>200 points</span>');
    expect(html).toContain('<strong>ann A</strong><span>200 points</span>');
    expect(html).toContain('Autumn');
    expect(html).toContain('Nobody chose this');
    expect(html).not.toContain('Your answer');
    expect(html).not.toContain('You entered:');
    expect(html).not.toContain('Your rank');
    expect(html).toContain('Create new game');
  });

  it('keeps aggregate rounds available when no players remain and omits invented winners', () => {
    const html = screen({ ...finished, standings: [], winnerIds: [] }, { recapCache: { 'round-1': results } });
    expect(html).toContain('No players remaining');
    expect(html).not.toContain('Our winner');
    expect(html).not.toContain('Joint winners');
    expect(html).toContain('Round recap');
    expect(html).toContain('Autumn');
  });
});
