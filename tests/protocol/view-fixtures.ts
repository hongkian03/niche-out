import type { CompleteView } from "../../packages/contracts/src/views.js";

export const ownPlayer = { playerId: "p-1", nickname: "Renée" };
const other = { playerId: "p-2", nickname: "Ash" };
const standings = [ownPlayer, other].map((identity) => ({ ...identity, rank: 1, publishedTotal: 0 }));
const roster = [ownPlayer, other].map((identity) => ({ ...identity, connection: "connected" as const }));
const ownAnswer = { locked: true as const, submittedText: "Lanternfish private fixture" };
const hosting = { status: "ready" as const, publicOrigin: "https://game.example.com" };
const readiness = { accepted: 1, eligible: 2 };
const revealed = { canonicalText: "Lanternfish", tierName: "Common", points: 0 };
const results = { groups: [{ ...revealed, count: 1 }], unused: { canonicalText: "Squid", tierName: "Rare", points: 10 } };
const ownResult = { outcome: "accepted" as const, submittedText: ownAnswer.submittedText, ...revealed };

const base = { protocolVersion: 1 as const, serverInstanceId: "server-1", phaseId: "phase-1", revision: 5, serverNowMs: 200 };
const game = { ...base, gameId: "game-1", promptCount: 1 };
const inactive = { phaseDeadlineMs: null, roundId: null, roundIndex: null };
const round = { roundId: "r-1", roundIndex: 0, prompt: "Name a sea creature." };
const timed = { ...game, ...round, phaseDeadlineMs: 1200 };
const final = {
  ...game, ...inactive, phase: "Finished" as const, standings,
  winnerIds: [ownPlayer.playerId, other.playerId], requestedDetail: { roundId: round.roundId, results },
};
export const summary = {
  title: "Ocean", promptCount: 1, tiers: [{ name: "Common", points: 0 }, { name: "Rare", points: 10 }],
  settings: { readingSeconds: 3, answerSeconds: 25, resultsSeconds: 10 },
};
export const setup = {
  ...base, ...inactive, phase: "Setup", viewRole: "host", hosting, gameId: null, promptCount: 0, setupGeneration: 0,
} as const satisfies CompleteView;
export const lobby = {
  ...game, ...inactive, phase: "Lobby", viewRole: "host", hosting, setupGeneration: 1, packSummary: summary, roster,
  invitation: { code: "012345", joinUrl: "https://game.example.com/join", qrPayload: "https://game.example.com/join?code=012345" },
  canStart: true, canReplace: true, admissionHistoryFull: false,
} as const satisfies CompleteView;

export const allViews: CompleteView[] = [
  setup, lobby,
  { ...game, ...inactive, phase: "Lobby", viewRole: "player", title: "Ocean", ownPlayer, admittedCount: 2, connection: "connected" },
  ...(["Reading", "Answering"] as const).flatMap((phase) => [
    { ...timed, phase, viewRole: "host" as const, hosting, roster, publishedStandings: standings, readiness: phase === "Reading" ? { ...readiness, accepted: 0 } : readiness },
    {
      ...timed, phase, viewRole: "player" as const, ownPlayer, ownAnswer: phase === "Reading" ?
        { locked: false as const, submittedText: null } : ownAnswer, controlGeneration: 1,
      publishedStandings: standings, publishedTotal: 0, readiness: phase === "Reading" ? { ...readiness, accepted: 0 } : readiness,
    },
  ]),
  { ...timed, phase: "Results", viewRole: "host", hosting, roster, results, standings: standings.map((s) => ({ ...s, roundPoints: 0 })) },
  { ...timed, phase: "Results", viewRole: "player", ownPlayer, ownResult, results, standings: standings.map((s) => ({ ...s, roundPoints: 0 })) },
  { ...final, viewRole: "host", hosting, rounds: [round], setupGeneration: 1 },
  { ...final, viewRole: "player", ownPlayer, rounds: [{ ...round, ownResult }] },
];
