import { completeView, type CompleteView } from '@rarity/contracts';
import type { ClientSnapshot } from '../../../apps/web/src/client.js';

export const scenarios = ['low', 'medium', 'high', 'zero', 'miss'] as const;
export type Scenario = typeof scenarios[number];
export type Phase = 'Reading' | 'Answering' | 'Results' | 'Finished';
export type Role = 'player' | 'host';
export const seconds = { Reading: 3, Answering: 25, Results: 10, Finished: 0 };

function awards(low: string, medium: string, high: string, zero: string) {
  return {
    low: { canonicalText: low, tierName: 'Surface Find', points: 12 },
    medium: { canonicalText: medium, tierName: 'Signal Find', points: 38 },
    high: { canonicalText: high, tierName: 'Trench Find', points: 72 },
    zero: { canonicalText: zero, tierName: 'Accepted Zero', points: 0 },
    miss: null,
  };
}

const history = [
  { roundId: 'round-1', roundIndex: 0, prompt: 'Name a layer of Earth’s atmosphere.' },
  { roundId: 'round-2', roundIndex: 1, prompt: 'Name a moon of Saturn.' },
  { roundId: 'round-3', roundIndex: 2, prompt: 'Name an instrument that measures weather.' },
] as const;
export const saturnAwards = awards('Titan', 'Enceladus', 'Hyperion', 'Dione');
const answerLists = [
  awards('Troposphere', 'Stratosphere', 'Mesosphere', 'Thermosphere'),
  saturnAwards,
  awards('Thermometer', 'Barometer', 'Anemometer', 'Rain gauge'),
] as const;
const unusedAnswers = ['Exosphere', 'Albiorix', 'Hygrometer'] as const;
const counts = ['high', 'medium', 'low', 'zero'] as const;
export type RoundIndex = typeof history[number]['roundIndex'];
export const lastRound: RoundIndex = 2;

interface RoundEntry {
  scenario: Scenario;
  submittedText: string | null;
}
const names = ['Mira', 'Sol', 'Nadia', 'Kai', 'Leena', 'Alex', 'Sam', 'Chen', 'Remy', 'Inez', 'Eli', 'Jules', 'Luz', 'Ren', 'Noor', 'Dara', 'Ari', 'Rae', 'Theo', 'Joy', 'Paz', 'Ash', 'Zoe', 'Dev'];
const outcomes: readonly Scenario[] = ['high', 'high', 'medium', 'medium', 'medium', 'medium', 'zero', ...Array<Scenario>(11).fill('low'), ...Array<Scenario>(6).fill('miss')];
const previousPoints = [48, 48, 58, 46, 41, 34, 57, 54, 44, 42, 39, 32, 30, 26, 24, 20, 18, 12, 22, 16, 10, 9, 6, 0];
const ownPlayer = { playerId: 'p-0', nickname: 'Mira' };
const hosting = { status: 'ready', publicOrigin: 'https://fixture.example.com' } as const;

export function matchDemoAnswer(answer: string, round: RoundIndex): Scenario | undefined {
  const key = answer.trim().toLowerCase().replace(/\s+/g, ' ');
  if (round === 1 && key === 'saturn vi') return 'low';
  return scenarios.find(scenario => answerLists[round][scenario]?.canonicalText.toLowerCase() === key);
}

export interface Demo {
  role: Role;
  phase: Phase;
  scenario: Scenario;
  round: RoundIndex;
  played: Partial<Record<RoundIndex, RoundEntry>> | null;
  phaseKey: number;
  revision: number;
  deadline: number;
  submittedText: string | null;
  rejectedText: string | null;
  ready: number;
  removedPlayers: readonly string[];
  crewSize: number;
  emptyResults: boolean;
}

function rank(rows: { playerId: string; nickname: string; publishedTotal: number; roundPoints: number }[]) {
  const ordered = [...rows].sort((a, b) => b.publishedTotal - a.publishedTotal || a.nickname.localeCompare(b.nickname));
  let place = 1;
  return ordered.map((row, index) => {
    if (index > 0 && row.publishedTotal !== ordered[index - 1].publishedTotal) place = index + 1;
    return { ...row, rank: place };
  });
}

function buildRound(demo: Demo, round: RoundIndex, entry: RoundEntry) {
  const answerList = answerLists[round];
  const sampleOutcomes = Array.from({ length: demo.crewSize }, (_, index) =>
    demo.emptyResults ? 'miss' as const : outcomes[index % outcomes.length],
  );
  const swap = sampleOutcomes.indexOf(entry.scenario);
  if (swap >= 0 && !demo.emptyResults) {
    [sampleOutcomes[0], sampleOutcomes[swap]] = [sampleOutcomes[swap], sampleOutcomes[0]];
  }
  const points = sampleOutcomes.map(scenario => answerList[scenario]?.points ?? 0);
  const award = answerList[sampleOutcomes[0]];
  const ownResult = award ? {
    outcome: 'accepted' as const,
    ...award,
    submittedText: entry.submittedText ?? (round === 1 && entry.scenario === 'low' ? 'Saturn VI' : award.canonicalText),
  } : { outcome: 'miss' as const, points: 0 as const };
  const results = {
    groups: counts.flatMap(key => {
      const count = sampleOutcomes.filter(outcome => outcome === key).length;
      return count ? [{ ...answerList[key], count }] : [];
    }),
    unused: { ...answerList.high, canonicalText: unusedAnswers[round] },
  };
  return { points, ownResult, results };
}

export function buildDemoSnapshot(demo: Demo): ClientSnapshot {
  const crew = Array.from({ length: demo.crewSize }, (_, index) => ({
    index,
    playerId: `p-${index}`,
    nickname: names[index] ?? `Crew ${index + 1}`,
    connection: index === 12 ? 'disconnected' as const : 'connected' as const,
  }));
  const remaining = crew.filter(player => !demo.removedPlayers.includes(player.playerId));
  const sampleRounds = demo.played;
  const completed = history.map(({ roundIndex }) => {
    const entry = sampleRounds?.[roundIndex];
    return entry ? buildRound(demo, roundIndex, entry) : null;
  });
  const scored = completed[demo.round] ?? buildRound(demo, demo.round, demo);
  const { ownResult, results } = scored;
  const prior = remaining.map(({ playerId, nickname, index }) => {
    const previous = sampleRounds ? completed.slice(0, demo.round).reduce((total, outcome) => total + (outcome?.points[index] ?? 0), 0)
      : previousPoints[index % previousPoints.length];
    return { index, playerId, nickname, publishedTotal: previous, roundPoints: 0 };
  });
  const roundStandings = rank(prior.map(({ index, ...row }) => {
    const roundPoints = scored.points[index];
    return { ...row, publishedTotal: row.publishedTotal + roundPoints, roundPoints };
  }));
  const prevStandings = rank(prior.map(({ index, ...row }) => row)).map(({ roundPoints, ...row }) => row);
  const base = {
    protocolVersion: 2, serverInstanceId: 'motion-preview', gameId: 'prototype-game',
    promptCount: history.length, phaseId: `preview-${demo.phaseKey}`, revision: demo.revision, serverNowMs: Date.now(),
  };
  const timed = { ...base, ...history[demo.round], phaseDeadlineMs: demo.deadline };
  const roster = remaining.map(({ playerId, nickname, connection }) => ({ playerId, nickname, connection }));
  const eligible = remaining.length;
  const accepted = crew.slice(0, demo.ready).filter(({ playerId }) => !demo.removedPlayers.includes(playerId)).length;
  const readiness = { accepted: demo.phase === 'Reading' ? 0 : Math.min(eligible, Math.max(accepted, Number(Boolean(demo.submittedText)))), eligible };
  let raw: unknown;
  if (demo.phase === 'Reading' || demo.phase === 'Answering') {
    raw = demo.role === 'player' ? {
      ...timed, phase: demo.phase, viewRole: 'player', readiness, ownPlayer,
      ownAnswer: demo.submittedText && demo.phase === 'Answering' ? { locked: true, submittedText: demo.submittedText } : { locked: false, submittedText: null },
      controlGeneration: 1, publishedTotal: prevStandings.find(row => row.playerId === ownPlayer.playerId)?.publishedTotal ?? 0,
    } : { ...timed, phase: demo.phase, viewRole: 'host', hosting, readiness, roster, publishedStandings: prevStandings };
  } else if (demo.phase === 'Results') {
    raw = demo.role === 'player' ? {
      ...timed, phase: 'Results', viewRole: 'player', ownPlayer, ownResult, results, standings: roundStandings,
    } : { ...timed, phase: 'Results', viewRole: 'host', hosting, roster, results, standings: roundStandings };
  } else {
    const standings = roundStandings.map(({ roundPoints, ...row }) => row);
    const final = { ...base, phase: 'Finished', roundId: null, roundIndex: null, phaseDeadlineMs: null, standings,
      winnerIds: standings.filter(row => row.rank === 1).map(row => row.playerId), requestedDetail: null };
    raw = demo.role === 'player' ? {
      ...final, viewRole: 'player', ownPlayer,
      rounds: history.map(round => ({
        ...round,
        ownResult: sampleRounds ? completed[round.roundIndex]?.ownResult ?? { outcome: 'miss', points: 0 }
          : round.roundIndex === 1 ? ownResult : round.roundIndex === 0 ? {
            outcome: 'accepted', canonicalText: 'Mesosphere', submittedText: 'Mesosphere', tierName: 'Signal Find', points: previousPoints[0],
          } : { outcome: 'miss', points: 0 },
      })),
    } : { ...final, viewRole: 'host', hosting, setupGeneration: 1, rounds: history };
  }
  const view: CompleteView = completeView.parse(raw);
  return {
    session: null, view, status: 'connected', error: null, pending: null, candidate: null,
    clockOffsetMs: 0, controlGeneration: 1,
    answerFeedback: demo.rejectedText ? { roundId: history[demo.round].roundId, status: 'rejected', submittedText: demo.rejectedText } : null,
    recapCache: Object.fromEntries(history.map(({ roundIndex, roundId }) => [
      roundId, sampleRounds ? completed[roundIndex]?.results ?? { groups: [], unused: null }
        : roundIndex === 1 ? results : { groups: [], unused: null },
    ])),
  };
}
