import { z } from "zod";
import { id, nonnegative, promptCount, playerCount, nickname, protocolVersion } from "./wire.js";
import { answerTextSchema, phaseSecondsSchema, promptTextSchema, tierNameSchema } from "./pack.js";
import { hostingStatusSchema, invitationSchema } from "./deployment.js";
import { codePointCount, trimOuterWhitespace } from "./text.js";

const title = z.string().refine((value) =>
  value.length > 0 && value === trimOuterWhitespace(value) && codePointCount(value) <= 256,
);
export const packSummary = z.strictObject({
  title, promptCount,
  tiers: z.array(z.strictObject({ name: tierNameSchema, points: nonnegative })).min(1),
  settings: z.strictObject({
    readingSeconds: phaseSecondsSchema, answerSeconds: phaseSecondsSchema, resultsSeconds: phaseSecondsSchema,
  }),
});

const identity = { playerId: id, nickname };
const connection = z.enum(["connected", "disconnected"]);
const roster = z.array(z.strictObject({ ...identity, connection })).max(100);
const standingFields = { ...identity, rank: z.int().min(1).max(100), publishedTotal: nonnegative };
const publishedStandings = z.array(z.strictObject(standingFields)).max(100);
const roundStandings = z.array(z.strictObject({ ...standingFields, roundPoints: nonnegative })).max(100);
const readiness = z.strictObject({ accepted: playerCount, eligible: playerCount })
  .refine((counts) => counts.accepted <= counts.eligible);
const locked = z.discriminatedUnion("locked", [
  z.strictObject({ locked: z.literal(false), submittedText: z.null() }),
  z.strictObject({ locked: z.literal(true), submittedText: answerTextSchema }),
]);
const revealedFields = { canonicalText: answerTextSchema, tierName: tierNameSchema, points: nonnegative };
const publicResults = z.strictObject({
  groups: z.array(z.strictObject({ ...revealedFields, count: z.int().min(1).max(1000) })),
  unused: z.strictObject(revealedFields).nullable(),
});
const acceptedResult = z.strictObject({ outcome: z.literal("accepted"), submittedText: answerTextSchema, ...revealedFields });
const missedResult = z.strictObject({ outcome: z.literal("miss"), points: z.literal(0) });
const personalResult = z.discriminatedUnion("outcome", [acceptedResult, missedResult]);
const diveBandSchema = z.enum(["low", "medium", "high"]);
export type DiveBand = z.infer<typeof diveBandSchema>;
const personalRoundResult = z.discriminatedUnion("outcome", [
  acceptedResult.extend({ diveBand: diveBandSchema.optional() }).refine(
    (result) => result.diveBand === undefined || result.points > 0,
    { path: ["diveBand"], message: "Dive depth applies to positive awards." },
  ),
  missedResult,
]);
const roundFields = { roundId: id, roundIndex: z.int().min(0).max(19), prompt: promptTextSchema };
const recapIndex = z.strictObject(roundFields);
const personalRecap = z.strictObject({ ...roundFields, ownResult: personalResult });
const requestedDetail = z.strictObject({ roundId: id, results: publicResults }).nullable();
const base = { protocolVersion, serverInstanceId: id, revision: nonnegative, phaseId: id, serverNowMs: z.number() };
const committed = { ...base, gameId: id, promptCount };
const inactive = { roundId: z.null(), roundIndex: z.null(), phaseDeadlineMs: z.null() };
const timed = { ...committed, ...roundFields, phaseDeadlineMs: z.number() };
const host = z.literal("host");
const player = z.literal("player");
const ownPlayer = z.strictObject(identity);

const setupHost = z.strictObject({
  ...base, ...inactive, phase: z.literal("Setup"), viewRole: host, hosting: hostingStatusSchema, gameId: z.null(), promptCount: z.literal(0),
  setupGeneration: nonnegative,
});

const lobbyHost = z.strictObject({
  ...committed, ...inactive, phase: z.literal("Lobby"), viewRole: host, hosting: hostingStatusSchema, setupGeneration: nonnegative,
  invitation: invitationSchema, packSummary, roster, canStart: z.boolean(), canReplace: z.boolean(), admissionHistoryFull: z.boolean(),
});
const lobbyPlayer = z.strictObject({
  ...committed, ...inactive, phase: z.literal("Lobby"), viewRole: player, title, ownPlayer,
  admittedCount: playerCount, connection,
});
const livePhase = z.enum(["Reading", "Answering"]);
const liveHost = z.strictObject({
  ...timed, phase: livePhase, viewRole: host, hosting: hostingStatusSchema, readiness, roster, publishedStandings,
});
const livePlayer = z.strictObject({
  ...timed, phase: livePhase, viewRole: player, readiness, ownPlayer, ownAnswer: locked,
  controlGeneration: nonnegative, publishedTotal: nonnegative,
});
const resultsHost = z.strictObject({
  ...timed, phase: z.literal("Results"), viewRole: host, hosting: hostingStatusSchema, roster, results: publicResults, standings: roundStandings,
});
const resultsPlayer = z.strictObject({
  ...timed, phase: z.literal("Results"), viewRole: player,
  ownPlayer, ownResult: personalRoundResult, results: publicResults, standings: roundStandings,
});
const finalFields = {
  ...committed, ...inactive, phase: z.literal("Finished"), standings: publishedStandings,
  winnerIds: z.array(id).max(100), requestedDetail,
};
const finishedHost = z.strictObject({
  ...finalFields, viewRole: host, hosting: hostingStatusSchema, setupGeneration: nonnegative, rounds: z.array(recapIndex).min(1).max(20),
});
const finishedPlayer = z.strictObject({
  ...finalFields, viewRole: player, ownPlayer, rounds: z.array(personalRecap).min(1).max(20),
});

const hostShape = z.discriminatedUnion("phase", [setupHost, lobbyHost, liveHost, resultsHost, finishedHost]);
const playerShape = z.discriminatedUnion("phase", [lobbyPlayer, livePlayer, resultsPlayer, finishedPlayer]);

function checkView(view: z.infer<typeof hostShape> | z.infer<typeof playerShape>, ctx: z.RefinementCtx) {
  if (view.roundIndex !== null && view.roundIndex >= view.promptCount) {
    ctx.addIssue({ code: "custom", path: ["roundIndex"], message: "Round index exceeds this pack." });
  }
  if (view.viewRole === "host" && view.phase === "Lobby" && view.canStart && view.hosting.status !== "ready") {
    ctx.addIssue({ code: "custom", path: ["canStart"], message: "Start requires verified public reachability." });
  }
  if (view.viewRole === "host" && view.phase === "Lobby" &&
      (view.hosting.status === "ready" || view.hosting.status === "reconnecting") &&
      view.invitation.joinUrl !== view.hosting.publicOrigin + "/join") {
    ctx.addIssue({ code: "custom", path: ["invitation"], message: "Invitation differs from the configured public origin." });
  }
  if (view.phase === "Lobby" && view.viewRole === "host" && view.packSummary.promptCount !== view.promptCount) {
    ctx.addIssue({ code: "custom", path: ["packSummary", "promptCount"], message: "Prompt counts disagree." });
  }
  if (view.phase === "Reading" &&
      (view.readiness.accepted !== 0 || (view.viewRole === "player" && view.ownAnswer.locked))) {
    ctx.addIssue({ code: "custom", message: "No answer can be locked during reading." });
  }
  if (view.phase !== "Finished") return;
  if (view.rounds.length !== view.promptCount || view.rounds.some((round, i) => round.roundIndex !== i) ||
      new Set(view.rounds.map((round) => round.roundId)).size !== view.rounds.length) {
    ctx.addIssue({ code: "custom", path: ["rounds"], message: "A final recap covers each completed round in order." });
  }
  if (view.requestedDetail && !view.rounds.some((round) => round.roundId === view.requestedDetail?.roundId)) {
    ctx.addIssue({ code: "custom", path: ["requestedDetail"], message: "Requested detail must identify a completed round." });
  }
  const winners = new Set(view.standings.filter((row) => row.rank === 1).map((row) => row.playerId));
  if (winners.size !== view.winnerIds.length || new Set(view.winnerIds).size !== view.winnerIds.length ||
      view.winnerIds.some((winner) => !winners.has(winner))) {
    ctx.addIssue({ code: "custom", path: ["winnerIds"], message: "Winners must match all first-place standings." });
  }
}

export const hostView = hostShape.superRefine(checkView);
export const playerView = playerShape.superRefine(checkView);
export const completeView = z.union([hostView, playerView]);
export type CompleteView = z.infer<typeof completeView>;

// Both events carry replaceable complete views. Only their delivery triggers differ.
export const serverEvents = {
  "state.snapshot": completeView,
  "state.changed": completeView,
  "player.superseded": z.strictObject({
    protocolVersion, serverInstanceId: id, gameId: id, tabId: id, controlGeneration: nonnegative, revision: nonnegative,
  }),
  "game.closed": z.strictObject({
    protocolVersion, serverInstanceId: id, gameId: id, revision: nonnegative,
    reason: z.enum(["replaced", "network-reconfigured", "public-origin-changed", "shutdown"]),
  }),
};
