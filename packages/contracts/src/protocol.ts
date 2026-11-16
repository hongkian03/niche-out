import { z } from "zod";
import {
  id, protocolVersion, nonnegative, code, nicknameInput, secret, requestContext, requestId,
  committedGame, empty, controlGrant,
} from "./wire.js";
import { answerTextSchema } from "./pack.js";
import { sessionRequest, sessionResponse, hostSession } from "./session.js";
import { completeView, hostView, packSummary } from "./views.js";

export const protocolLimits = {
  envelopeBytes: 4096, uploadBytes: 10 * 1024 * 1024, acknowledgementMs: 2000, identicalRetries: 2,
} as const;

// Use actual received bytes before decoding ordinary HTTP JSON or Socket.IO
// command data. Never reserialize parsed data to approve an oversized input.
export function checkEnvelopeSize(receivedBytes: number) {
  return Number.isSafeInteger(receivedBytes) && receivedBytes >= 0 && receivedBytes <= protocolLimits.envelopeBytes;
}

const activeContext = { ...requestContext, gameId: id };
const readContext = { ...requestContext, gameId: id.nullable() };
export const socketCommands = {
  "game.join": z.strictObject({
    ...readContext, payload: z.strictObject({ code, nickname: nicknameInput }),
  }),
  "game.resume": z.strictObject({
    ...activeContext, payload: z.strictObject({ mode: z.enum(["loaded", "bootstrap"]) }),
  }),
  "player.claimControl": z.strictObject({
    ...activeContext, payload: z.strictObject({ explicit: z.literal(true) }),
  }),
  "game.start": z.strictObject({ ...activeContext, payload: empty }),
  "answer.submit": z.strictObject({
    ...activeContext, roundId: id, controlGeneration: nonnegative, payload: z.strictObject({ text: answerTextSchema }),
  }),
  "player.remove": z.strictObject({ ...activeContext, payload: z.strictObject({ targetPlayerId: id }) }),
  "state.get": z.strictObject({
    ...readContext, payload: z.strictObject({ recapRoundId: id.optional() }),
  }),
  "clock.sample": z.strictObject({
    ...readContext, payload: z.strictObject({ sampleId: id }),
  }),
};
export type CommandName = keyof typeof socketCommands;
export type CommandInput<N extends CommandName> = z.infer<(typeof socketCommands)[N]>;

export const errorCodes = z.enum([
  "INVALID_PAYLOAD", "UNSUPPORTED_VERSION", "UNAUTHORIZED", "FORBIDDEN", "HOST_PLAYER_CONFLICT",
  "EXPIRED", "NOT_ANSWERING", "WRONG_GAME", "WRONG_ROUND", "WRONG_INSTANCE", "WRONG_PHASE",
  "REMOVED", "TAB_SUPERSEDED", "CONTROL_CONFIRMATION_REQUIRED", "REQUEST_ID_REUSE", "STALE_REQUEST",
  "OPERATION_CANCELLED", "RATE_LIMITED", "GAME_FULL", "GAME_NOT_FOUND", "NO_LOBBY", "ENTRY_CLOSED",
  "GAME_FINISHED", "NICKNAME_TAKEN", "NO_PLAYERS", "UPLOAD_TOO_LARGE", "INVALID_PACK",
  "CANDIDATE_EXPIRED", "CANDIDATE_STALE", "IMPORT_IN_PROGRESS", "IMPORT_TIMEOUT", "IMPORT_CAPACITY",
  "TUNNEL_NOT_READY", "SESSION_CAPACITY", "PAGE_CAPACITY", "ADMISSION_HISTORY_LIMIT", "HANDSHAKE_CAPACITY",
]);
// HTTP status is transport metadata. Socket acknowledgements carry only the code.
export const httpStatusForError = {
  INVALID_PAYLOAD: 400, UNSUPPORTED_VERSION: 400, UNAUTHORIZED: 401, FORBIDDEN: 403,
  HOST_PLAYER_CONFLICT: 409, EXPIRED: 409, NOT_ANSWERING: 409, WRONG_GAME: 409, WRONG_ROUND: 409,
  WRONG_INSTANCE: 409, WRONG_PHASE: 409, REMOVED: 403, TAB_SUPERSEDED: 403,
  CONTROL_CONFIRMATION_REQUIRED: 409, REQUEST_ID_REUSE: 409, STALE_REQUEST: 409,
  OPERATION_CANCELLED: 409, RATE_LIMITED: 429, GAME_FULL: 409, GAME_NOT_FOUND: 409, NO_LOBBY: 409,
  ENTRY_CLOSED: 409, GAME_FINISHED: 409, NICKNAME_TAKEN: 409, NO_PLAYERS: 409,
  UPLOAD_TOO_LARGE: 413, INVALID_PACK: 422, CANDIDATE_EXPIRED: 409, CANDIDATE_STALE: 409,
  IMPORT_IN_PROGRESS: 409, IMPORT_TIMEOUT: 503, IMPORT_CAPACITY: 503, SESSION_CAPACITY: 503,
  TUNNEL_NOT_READY: 503, PAGE_CAPACITY: 503, ADMISSION_HISTORY_LIMIT: 503, HANDSHAKE_CAPACITY: 503,
} as const satisfies Record<z.infer<typeof errorCodes>, number>;
export const failure = z.strictObject({
  code: errorCodes, message: z.string().min(1), requestId: requestId.optional(),
  fieldErrors: z.array(z.strictObject({ path: z.array(z.union([z.string(), nonnegative])), message: z.string().min(1) })).optional(),
});
const reply = { requestId, gameId: id, revision: nonnegative };
const readReply = { ...reply, gameId: id.nullable() };
const started = z.strictObject({ ...reply, outcome: z.literal("STARTED") });
const removed = z.strictObject({ ...reply, outcome: z.literal("REMOVED"), targetPlayerId: id });
const granted = { ...reply, control: controlGrant };
const accepted = z.strictObject({
  ...reply, roundId: id, outcome: z.enum(["ACCEPTED", "ALREADY_LOCKED"]),
  submittedText: answerTextSchema, locked: z.literal(true),
});
const answerReply = z.union([
  accepted,
  z.strictObject({ ...reply, roundId: id, outcome: z.literal("REJECTED"), locked: z.literal(false) }),
]);
const stateReply = z.strictObject({ ...readReply, outcome: z.literal("STATE"), view: completeView })
  .refine((response) => response.view.gameId === response.gameId && response.view.revision === response.revision,
    "State acknowledgement context must match its complete view.");
export const socketAcknowledgements = {
  "game.join": z.union([failure, z.strictObject({ ...granted, outcome: z.literal("JOINED") })]),
  "game.resume": z.union([failure,
    z.strictObject({ ...granted, outcome: z.literal("RESUMED") }),
    z.strictObject({ ...reply, outcome: z.literal("RESUMED"), control: z.null() }), // host
  ]),
  "player.claimControl": z.union([failure, z.strictObject({ ...granted, outcome: z.literal("CONTROL_GRANTED") })]),
  "game.start": z.union([failure, started]),
  "answer.submit": z.union([failure, answerReply]),
  "player.remove": z.union([failure, removed]),
  "state.get": z.union([failure, stateReply]),
  "clock.sample": z.union([failure, z.strictObject({
    ...readReply, outcome: z.literal("CLOCK"), sampleId: id, serverNowMs: z.number(),
  })]),
} satisfies Record<CommandName, z.ZodType>;

export const commitRequest = z.strictObject({
  ...requestContext, candidateId: id, expectedGameId: id.nullable(), expectedSetupGeneration: nonnegative,
});
const committed = z.strictObject({ outcome: z.literal("COMMITTED"), ...committedGame.shape });
export const hostOperation = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("game.commit"), original: commitRequest }),
  z.strictObject({ kind: z.literal("game.start"), original: socketCommands["game.start"] }),
  z.strictObject({ kind: z.literal("player.remove"), original: socketCommands["player.remove"] }),
]);

// Resolution is deliberately bound to the original operation (including its
// ID, candidate/game and removal target). There is no new mutation ID here.
export const resolveRequest = z.strictObject({ protocolVersion, operation: hostOperation });
export const resolution = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("APPLIED"), result: z.union([committed, started, removed]), view: hostView,
  }),
  z.strictObject({ outcome: z.literal("NOT_APPLIED"), view: hostView }),
  z.strictObject({ outcome: z.literal("SUPERSEDED"), view: hostView }),
]).refine((response) => response.outcome !== "APPLIED" ||
  (response.view.gameId === response.result.gameId && response.view.revision >= response.result.revision),
  "An applied result must refer to the current game and a finalized revision.");

export const importRequest = z.instanceof(Uint8Array).refine((bytes) =>
  bytes.byteLength <= protocolLimits.uploadBytes, "Upload exceeds 10 MiB.",
);
const importSummary = z.strictObject({
  serverInstanceId: id, candidateId: id, expectedGameId: id.nullable(), expectedSetupGeneration: nonnegative,
  summary: packSummary,
});
const shell = z.string().min(1); // Locally built HTML response, not JSON.
export const httpRoutes = {
  "GET /health": { request: empty, success: z.strictObject({ protocolVersion, appVersion: id, live: z.literal(true) }) },
  "POST /api/session": { request: sessionRequest, success: sessionResponse },
  "POST /api/owner/exchange": { request: z.strictObject({ protocolVersion, token: secret }), success: hostSession },
  "POST /api/host/import": { request: importRequest, success: importSummary },
  "POST /api/host/games": { request: commitRequest, success: committed },
  "POST /api/host/operations/resolve": { request: resolveRequest, success: resolution },
  "GET /api/snapshot": {
    // Query values are strings; omit gameId for host Setup.
    request: z.strictObject({ serverInstanceId: id, gameId: id.optional(), tabId: id }), success: completeView,
  },
  "GET /host": { request: empty, success: shell },
  "GET /join": { request: z.strictObject({ code: code.optional() }), success: shell },
};

// Raw semantic identity for server-side comparison. It includes private answer
// or proof-related data when present and must never be logged or sent in views.
// Parsed requests contain only finite JSON values, and objects exclude unknown
// keys. Stable key ordering makes harmless transport property order irrelevant.
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map((key) =>
      JSON.stringify(key) + ":" + canonicalJson(record[key]),
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}
export type MutationName = Exclude<CommandName, "state.get" | "clock.sample"> | "game.commit";
export function mutationFingerprint(kind: MutationName, body: unknown): string {
  const schema = kind === "game.commit" ? commitRequest : socketCommands[kind];
  return canonicalJson([kind, schema.parse(body)]);
}
