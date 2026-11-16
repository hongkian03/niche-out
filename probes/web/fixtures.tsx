import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { completeView, invitationForOrigin, sessionResponse, type CompleteView } from '@rarity/contracts';
import { App } from '../../apps/web/src/App.js';
import { Dialog, Ocean, type PublicResults } from '../../apps/web/src/components.js';
import type { ClientSnapshot, GameClient } from '../../apps/web/src/client.js';
import '../../apps/web/src/styles.css';

// This entry is built only by the layout probe, never into the production app.
const max = Number.MAX_SAFE_INTEGER;
const longPrompt = 'P'.repeat(4096), longAnswer = 'A'.repeat(512), longTier = 'T'.repeat(128), longName = 'N'.repeat(32);
const origin = 'https://fixture.example.com';
const hosting = { status: 'ready', publicOrigin: origin } as const;
const roster = Array.from({ length: 100 }, (_, index) => ({ playerId: `p-${index}`, nickname: index === 99 ? longName : `Crew ${String(index).padStart(3, '0')}`, connection: index % 3 ? 'connected' as const : 'disconnected' as const }));
const ownPlayer = { playerId: 'p-99', nickname: longName };
const summary = { title: 'A'.repeat(256), promptCount: 1, tiers: [{ name: longTier, points: max }, { name: 'Accepted zero', points: 0 }], settings: { readingSeconds: 3, answerSeconds: 25, resultsSeconds: 10 } };
const personal = { outcome: 'accepted', submittedText: 'Fall', canonicalText: 'Autumn', tierName: 'Rare', points: 100 } as const;
const ordinaryResults: PublicResults = { groups: [{ canonicalText: 'Autumn', tierName: 'Rare', points: 100, count: 2 }, { canonicalText: 'Summer', tierName: 'Common', points: 10, count: 1 }], unused: { canonicalText: 'Winter', tierName: 'Rare', points: 100 } };
const longResults: PublicResults = { groups: [{ canonicalText: longAnswer, tierName: longTier, points: max, count: 100 }], unused: { canonicalText: longAnswer, tierName: longTier, points: max } };
const standings = roster.map((player, index) => ({ playerId: player.playerId, nickname: player.nickname, rank: index < 2 ? 1 : index + 1, publishedTotal: index < 2 ? max : 10 }));

export const fixtureNames = ['host-setup', 'host-lobby', 'host-answering', 'host-long-prompt', 'host-results', 'host-empty-final', 'host-final',
  'player-reading', 'player-answering', 'player-long-prompt', 'player-results-long', 'player-results-zero', 'player-results-miss', 'player-all-used', 'player-final', 'player-pending', 'player-reconnecting', 'player-join', 'player-join-full', 'player-lobby', 'player-removed', 'player-closed', 'player-superseded', 'player-connection-error', 'host-conflict', 'host-import-error'] as const;
type FixtureName = typeof fixtureNames[number];

function makeState(name: FixtureName): ClientSnapshot {
  if (name === 'player-join' || name === 'player-join-full') {
    const state = makeState('player-answering');
    return { ...state, view: null, session: sessionResponse.parse({ protocolVersion: 1, serverInstanceId: 'fixture-server', tabId: 'fixture-tab', requestPrefix: 'fixtureprefix',
      role: 'guest', membership: null, resume: 'none', hostGameId: null, lastGameCommit: null }),
      error: name === 'player-join-full' ? { code: 'GAME_FULL', message: 'This game is full.' } : null };
  }
  if (name === 'host-import-error') return { ...makeState('host-setup'), candidate: null, error: { code: 'INVALID_PACK', message: 'Check the game file and try again.',
    fieldErrors: [{ path: ['prompts', 0, 'answers', 0, 'tier'], message: 'This tier is not defined in the game.' }] } };
  if (['player-removed', 'player-closed', 'player-superseded', 'player-connection-error', 'host-conflict'].includes(name)) {
    const statuses = { 'player-removed': 'removed', 'player-closed': 'closed', 'player-superseded': 'superseded', 'player-connection-error': 'error', 'host-conflict': 'host-conflict' } as const;
    return { ...makeState('player-answering'), status: statuses[name as keyof typeof statuses],
      error: name === 'player-connection-error' ? { code: 'TRANSPORT', message: 'Connection interrupted. Reconnecting to confirm the current game.' } : null };
  }
  const now = Date.now();
  const base = { protocolVersion: 1, serverInstanceId: 'fixture-server', revision: 10, phaseId: `phase-${name}`, serverNowMs: now, gameId: 'fixture-game', promptCount: 1 };
  const inactive = { roundId: null, roundIndex: null, phaseDeadlineMs: null };
  const round = { roundId: 'round-1', roundIndex: 0, prompt: name.includes('long-prompt') ? longPrompt : 'Name one of the four seasons.' };
  const timed = { ...base, ...round, phaseDeadlineMs: now + 600000 };
  let view: unknown;
  if (name === 'host-setup') view = { ...base, ...inactive, phase: 'Setup', viewRole: 'host', gameId: null, promptCount: 0, setupGeneration: 0, hosting };
  else if (name === 'host-lobby') view = { ...base, ...inactive, phase: 'Lobby', viewRole: 'host', hosting, setupGeneration: 1, packSummary: summary, roster,
    invitation: invitationForOrigin(origin, '001234'), canStart: true, canReplace: true, admissionHistoryFull: false };
  else if (name === 'host-answering' || name === 'host-long-prompt') view = { ...timed, phase: 'Answering', viewRole: 'host', hosting, roster, readiness: { accepted: 50, eligible: 100 }, publishedStandings: standings };
  else if (name === 'host-results') view = { ...timed, phase: 'Results', viewRole: 'host', hosting, roster, results: ordinaryResults, standings: standings.map(row => ({ ...row, roundPoints: 10 })) };
  else if (name === 'host-empty-final' || name === 'host-final') view = { ...base, ...inactive, phase: 'Finished', viewRole: 'host', hosting, setupGeneration: 1,
    standings: name === 'host-empty-final' ? [] : standings, winnerIds: name === 'host-empty-final' ? [] : ['p-0', 'p-1'], requestedDetail: null, rounds: [round] };
  else if (name === 'player-lobby') view = { ...base, ...inactive, phase: 'Lobby', viewRole: 'player', ownPlayer, title: summary.title, admittedCount: 100, connection: 'connected' };
  else if (name === 'player-final') view = { ...base, ...inactive, phase: 'Finished', viewRole: 'player', ownPlayer, standings: [{ ...ownPlayer, rank: 1, publishedTotal: max }], winnerIds: [ownPlayer.playerId], requestedDetail: null,
    rounds: [{ ...round, ownResult: { outcome: 'accepted', submittedText: longAnswer, canonicalText: longAnswer, tierName: longTier, points: max } }] };
  else if (name.startsWith('player-results') || name === 'player-all-used') view = { ...timed, phase: 'Results', viewRole: 'player', ownPlayer,
    ownResult: name === 'player-results-miss' ? { outcome: 'miss', points: 0 } : name === 'player-results-long' ? { outcome: 'accepted', submittedText: longAnswer, canonicalText: longAnswer, tierName: longTier, points: max } : name === 'player-results-zero' ? { ...personal, tierName: 'Accepted zero', points: 0 } : personal,
    results: name === 'player-results-long' ? longResults : name === 'player-all-used' ? { ...ordinaryResults, unused: null } : name === 'player-results-miss' ? { groups: [], unused: ordinaryResults.unused } : ordinaryResults,
    standings: standings.map(row => ({ ...row, roundPoints: 0 })) };
  else view = { ...timed, phase: name === 'player-reading' ? 'Reading' : 'Answering', viewRole: 'player', ownPlayer,
    ownAnswer: { locked: false, submittedText: null }, controlGeneration: 1, publishedTotal: max, publishedStandings: standings,
    readiness: { accepted: name === 'player-reading' ? 0 : 50, eligible: 100 } };
  const valid = completeView.parse(view);
  const session = sessionResponse.parse({ protocolVersion: 1, serverInstanceId: 'fixture-server', tabId: 'fixture-tab', requestPrefix: 'fixtureprefix', role: valid.viewRole,
    membership: valid.viewRole === 'host' ? null : { ...ownPlayer, gameId: 'fixture-game', status: 'admitted' }, resume: valid.viewRole === 'host' ? 'none' : 'continuation', hostGameId: valid.viewRole === 'host' ? valid.gameId : null,
    lastGameCommit: valid.viewRole === 'host' && valid.gameId ? { requestId: 'fixtureprefix.1', candidateId: 'fixture-candidate', gameId: valid.gameId, setupGeneration: 1, revision: 1 } : null });
  return { session, view: valid, status: name === 'player-reconnecting' ? 'reconnecting' : 'connected', error: null,
    pending: name === 'player-pending' ? { kind: 'answer', label: 'Checking answer…' } : null,
    candidate: name === 'host-setup' ? { serverInstanceId: 'fixture-server', candidateId: 'fixture-candidate', expectedGameId: null, expectedSetupGeneration: 0, summary } : null,
    clockOffsetMs: 0, controlGeneration: 1, answerFeedback: name === 'player-pending' ? { roundId: 'round-1', status: 'confirming', submittedText: longAnswer } : null,
    recapCache: { 'round-1': name === 'player-final' ? longResults : ordinaryResults } };
}

class FixtureClient {
  state = makeState('host-lobby');
  submittedAnswers: string[] = [];
  listeners = new Set<() => void>();
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  set = (patch: Partial<ClientSnapshot>) => { this.state = { ...this.state, ...patch }; this.listeners.forEach(listener => listener()); };
  show = (name: FixtureName) => this.set(makeState(name));
  boot = async () => {};
  dispose = () => {};
  retry = async () => { this.set({ status: 'connected', error: null }); };
  clearError = () => this.set({ error: null });
  discardCandidate = () => this.set({ candidate: null, error: null });
  remove = async () => { this.set({ pending: { kind: 'remove', label: 'Confirming game…' } }); };
  start = async () => { this.show('host-answering'); };
  upload = async () => {};
  commit = async () => { this.show('host-lobby'); };
  recap = async () => {};
  join = async () => {};
  submit = async (text: string) => {
    this.submittedAnswers.push(text);
    this.set({ pending: { kind: 'answer', label: 'Checking answer…' },
      answerFeedback: { roundId: this.state.view?.roundId ?? 'round-1', status: 'checking', submittedText: text } });
  };
  claimControl = async () => { this.set({ status: 'connected' }); };
}
const client = new FixtureClient();
let modalPhase: (() => void) | undefined;
function DialogFixture() {
  const [open, setOpen] = useState(false), [next, setNext] = useState(false);
  modalPhase = () => setNext(true);
  return <div className="app-frame"><Ocean /><main className="player-screen panel"><h1 id="phase-heading" data-phase-heading tabIndex={-1}>{next ? 'Current phase heading' : 'First phase'}</h1>
    {!next && <button type="button" onClick={() => setOpen(true)}>Open fixture dialog</button>}
    <button type="button">Background action</button>
    <Dialog open={open} title="Fixture dialog" onClose={() => setOpen(false)}><p>A modal that stays open during a phase change.</p><button data-initial-focus type="button" onClick={() => setOpen(false)}>Cancel</button><button type="button">Last modal action</button></Dialog>
  </main></div>;
}

const root = createRoot(document.getElementById('app')!);
function show(name: string) {
  if (name === 'dialog') root.render(<DialogFixture />);
  else {
    if (!fixtureNames.includes(name as FixtureName)) throw new Error('Unknown fixture: ' + name);
    client.show(name as FixtureName); root.render(<App client={client as unknown as GameClient} />);
  }
  document.documentElement.dataset.fixture = name;
}
declare global { interface Window { webFixture: {
  names: readonly string[]; show: (name: string) => void; state: () => ClientSnapshot;
  patch: (patch: Partial<ClientSnapshot>) => void; nextModalPhase: () => void;
  changeView: (view: CompleteView) => void;
  submittedAnswers: () => string[]; clearSubmittedAnswers: () => void;
} } }
window.webFixture = { names: fixtureNames, show, state: () => client.state, patch: client.set, nextModalPhase: () => modalPhase?.(),
  changeView: (view) => client.set({ view: completeView.parse(view) }),
  submittedAnswers: () => [...client.submittedAnswers], clearSubmittedAnswers: () => { client.submittedAnswers = []; } };
show(new URLSearchParams(location.search).get('fixture') ?? 'host-lobby');
