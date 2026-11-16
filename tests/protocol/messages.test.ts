import { describe, expect, it } from "vitest";
import {
  checkEnvelopeSize, failure, httpRoutes, mutationFingerprint, protocolLimits, resolution,
  socketAcknowledgements, socketCommands, httpStatusForError,
} from "../../packages/contracts/src/protocol.js";
import type { CommandName } from "../../packages/contracts/src/protocol.js";
import { continuationRecord, sessionResponse } from "../../packages/contracts/src/session.js";
import { lobby, setup, summary } from "./view-fixtures.js";

const ctx = { protocolVersion: 1, serverInstanceId: "server-1", tabId: "page-1", requestId: "doc.1" };
const gameId = "game-1";
const active = { ...ctx, gameId };
const fresh = { protocolVersion: 1, page: { kind: "fresh" } };
const proof = { serverInstanceId: "server-1", gameId, previousTabId: "page-0", continuationToken: "A".repeat(43) };
const session = { protocolVersion: 1, serverInstanceId: "server-1", tabId: "page-1", requestPrefix: "doc" };
const host = { ...session, role: "host", membership: null, hostGameId: null, lastGameCommit: null, resume: "none" };
const guest = { ...host, role: "guest" };
const player = {
  ...session, role: "player", hostGameId: null, lastGameCommit: null, resume: "continuation",
  membership: { gameId, playerId: "p-1", nickname: "Renée", status: "admitted" },
};
const commit = { ...ctx, candidateId: "candidate-1", expectedGameId: null, expectedSetupGeneration: 1 };
const committed = { requestId: "doc.1", candidateId: "candidate-1", gameId, setupGeneration: 1, revision: 5 };
const ack = { requestId: "doc.1", gameId, revision: 5 };
const grant = { controlGeneration: 2, continuation: proof };
const commands = {
  "game.join": { ...ctx, gameId: null, payload: { nickname: "  Rénée ", code: "012345" } },
  "game.resume": { ...active, payload: { mode: "bootstrap" } },
  "player.claimControl": { ...active, payload: { explicit: true } },
  "game.start": { ...active, payload: {} },
  "answer.submit": { ...active, roundId: "r-1", controlGeneration: 1, payload: { text: "bass" } },
  "player.remove": { ...active, payload: { targetPlayerId: "p-2" } },
  "state.get": { ...active, payload: { recapRoundId: "r-1" } },
  "clock.sample": { ...active, payload: { sampleId: "sample-1" } },
} satisfies Record<CommandName, unknown>;

describe("versioned command and acknowledgement shapes", () => {
  it.each(Object.keys(commands) as CommandName[])("%s admits only the documented payload and context", (name) => {
    const body = commands[name];
    expect(socketCommands[name].parse(body)).toEqual(body);
    for (const extra of [{ protocolVersion: 2 }, { requestId: "doc.0" }, { requestId: "doc.9007199254740992" },
      { serverInstanceId: undefined }, { playerId: "forged" }, { payload: { ...body.payload, desiredRole: "host" } }])
      expect(socketCommands[name].safeParse({ ...body, ...extra }).success).toBe(false);
  });
  it("requires controller generation and round only on answer submissions", () => {
    for (const key of ["roundId", "controlGeneration"] as const) {
      expect(socketCommands["answer.submit"].safeParse({ ...commands["answer.submit"], [key]: undefined }).success).toBe(false);
    }
    for (const name of ["game.join", "player.claimControl", "game.resume"] as const) {
      expect(socketCommands[name].safeParse({ ...commands[name], controlGeneration: 5 }).success).toBe(false);
    }
    expect(socketCommands["player.claimControl"].safeParse({ ...active, payload: { explicit: false } }).success).toBe(false);
    expect(socketCommands["game.join"].safeParse({ ...active, payload: { code: 12345, nickname: "X" } }).success).toBe(false);
  });
  it("binds duplicate comparison to the original validated operation and semantic values", () => {
    const original = commands["answer.submit"];
    const compare = (body: unknown) => mutationFingerprint("answer.submit", body);
    const reordered = Object.fromEntries(Object.entries(original).reverse());
    expect(compare(original)).toEqual(compare(reordered));
    for (const change of [{ requestId: "doc.2" }, { roundId: "other" }, { controlGeneration: 2 }, { payload: { text: "Bass" } }])
      expect(compare({ ...original, ...change })).not.toEqual(compare(original));
    expect(mutationFingerprint("game.commit", commit)).not.toBe(mutationFingerprint("game.commit", { ...commit, candidateId: "new" }));
    expect(failure.safeParse({ code: "REQUEST_ID_REUSE", message: "Request contents changed.", requestId: "doc.1" }).success).toBe(true);
  });
  it("checks actual input bytes separately from Unicode character count", () => {
    expect(checkEnvelopeSize(protocolLimits.envelopeBytes)).toBe(true);
    expect(checkEnvelopeSize(protocolLimits.envelopeBytes + 1)).toBe(false);
    expect(checkEnvelopeSize(NaN)).toBe(false);
  });
  it("validates every success response as well as a shared failure", () => {
    const replies = {
      "game.join": { ...ack, outcome: "JOINED", control: grant },
      "player.claimControl": { ...ack, outcome: "CONTROL_GRANTED", control: grant },
      "game.resume": { ...ack, outcome: "RESUMED", control: grant },
      "game.start": { ...ack, outcome: "STARTED" },
      "answer.submit": { ...ack, outcome: "ACCEPTED", roundId: "r-1", submittedText: "bass", locked: true },
      "player.remove": { ...ack, outcome: "REMOVED", targetPlayerId: "p-2" },
      "state.get": { ...ack, outcome: "STATE", view: lobby },
      "clock.sample": { ...ack, outcome: "CLOCK", sampleId: "sample-1", serverNowMs: 200 },
    } satisfies Record<CommandName, unknown>;
    for (const name of Object.keys(replies) as CommandName[]) {
      expect(socketAcknowledgements[name].parse(replies[name])).toEqual(replies[name]);
      expect(socketAcknowledgements[name].safeParse({ code: "UNAUTHORIZED", message: "Sign in again." }).success).toBe(true);
      expect(socketAcknowledgements[name].safeParse({ ...replies[name], futurePrompt: "secret" }).success).toBe(false);
    }
    const accept = replies["answer.submit"];
    for (const extra of [{ tierName: "Rare" }, { points: 0 }, { total: 10 }, { canonicalText: "Bass" }])
      expect(socketAcknowledgements["answer.submit"].safeParse({ ...accept, ...extra }).success).toBe(false);
    expect(socketAcknowledgements["answer.submit"].safeParse({ ...accept, outcome: "ALREADY_LOCKED" }).success).toBe(true);
    expect(socketAcknowledgements["answer.submit"].safeParse({ ...ack, outcome: "REJECTED", roundId: "r-1", locked: false }).success).toBe(true);
  });
});

describe("HTTP and recovery boundaries", () => {
  const operation = { kind: "game.commit", original: commit };
  const routeSamples = {
    "GET /health": [{}, { gameId }, { live: true, protocolVersion: 1, appVersion: "0.1" }],
    "POST /api/session": [fresh, { ...fresh, role: "host" }, guest],
    "POST /api/owner/exchange": [{ protocolVersion: 1, token: proof.continuationToken }, { protocolVersion: 1, token: "invalid" }, host],
    "POST /api/host/import": [
      new TextEncoder().encode("{}"), "{}", { serverInstanceId: "server-1", candidateId: "candidate-1", expectedGameId: null, expectedSetupGeneration: 1, summary },
    ],
    "POST /api/host/games": [commit, { ...commit, candidateId: undefined }, { ...committed, outcome: "COMMITTED" }],
    "POST /api/host/operations/resolve": [{ protocolVersion: 1, operation }, { protocolVersion: 1, operation: { kind: "game.commit", original: {} } }, { outcome: "NOT_APPLIED", view: setup }],
    "GET /api/snapshot": [{ serverInstanceId: "server-1", gameId, tabId: "t" }, { gameId, role: "host" }, lobby],
    "GET /host": [{}, { desiredRole: "host" }, "<!doctype html>"],
    "GET /join": [{ code: "012345" }, { code: "12345" }, "<!doctype html>"],
  } satisfies Record<keyof typeof httpRoutes, [unknown, unknown, unknown]>;
  it.each(Object.keys(routeSamples) as (keyof typeof httpRoutes)[])("%s input, rejection and success", (route) => {
    const [input, invalid, success] = routeSamples[route];
    expect(httpRoutes[route].request.safeParse(input).success).toBe(true);
    expect(httpRoutes[route].request.safeParse(invalid).success).toBe(false);
    expect(httpRoutes[route].success.safeParse(success).success).toBe(true);
  });
  it("validates raw upload bounds and a sanitized, complete preview", () => {
    const route = httpRoutes["POST /api/host/import"];
    expect(route.request.safeParse(new Uint8Array(protocolLimits.uploadBytes + 1)).success).toBe(false);
    const preview = routeSamples["POST /api/host/import"][2];
    expect(route.success.safeParse({ ...preview, summary: { ...summary, prompts: [] } }).success).toBe(false);
    expect(route.success.safeParse({ ...preview, summary: { ...summary, settings: {} } }).success).toBe(false);
  });
  it("resolves commit, Start and removal only through the original request", () => {
    const route = httpRoutes["POST /api/host/operations/resolve"];
    for (const kind of ["game.start", "player.remove"] as const) {
      expect(route.request.safeParse({ protocolVersion: 1, operation: { kind, original: commands[kind] } }).success).toBe(true);
    }
    expect(route.request.safeParse({ protocolVersion: 1, operation: { kind: "answer.submit", original: commands["answer.submit"] } }).success).toBe(false);
    for (const result of [
      { ...committed, outcome: "COMMITTED" }, { ...ack, outcome: "STARTED" }, { ...ack, outcome: "REMOVED", targetPlayerId: "p-2" },
    ]) expect(resolution.safeParse({ outcome: "APPLIED", result, view: lobby }).success).toBe(true);
    for (const outcome of ["NOT_APPLIED", "SUPERSEDED"]) {
      expect(resolution.safeParse({ outcome, view: setup }).success).toBe(true);
      expect(resolution.safeParse({ outcome, view: lobby, result: committed }).success).toBe(false);
    }
    expect(resolution.safeParse({ outcome: "APPLIED", view: lobby }).success).toBe(false);
    expect(resolution.safeParse({
      outcome: "APPLIED", view: setup, result: { ...committed, outcome: "COMMITTED" },
    }).success).toBe(false);
    expect(failure.safeParse({ code: "OPERATION_CANCELLED", requestId: "doc.1", message: "Operation fenced." }).success).toBe(true);
  });
});

describe("credential discovery and proof shape", () => {
  it("separates host, guest, admitted and removed and keeps commit metadata host-only", () => {
    const removed = { ...player, membership: { ...player.membership, status: "removed" }, resume: "none" };
    for (const view of [host, guest, player, removed, { ...host, hostGameId: gameId, lastGameCommit: committed }])
      expect(sessionResponse.safeParse(view).success).toBe(true);
    for (const bad of [
      { ...guest, membership: player.membership }, { ...player, lastGameCommit: committed }, { ...host, hostGameId: gameId },
      { ...removed, resume: "fresh" }, { ...player, token: proof.continuationToken }, { ...guest, standings: [] },
    ]) expect(sessionResponse.safeParse(bad).success).toBe(false);
    expect(httpStatusForError.HOST_PLAYER_CONFLICT).toBe(409);
    expect(failure.safeParse({ code: "HOST_PLAYER_CONFLICT", message: "Use a separate browser profile." }).success).toBe(true);
  });
  it("separates unavailable/stale storage from a genuinely fresh page and rejects persisted drafts", () => {
    for (const page of [
      { kind: "fresh" }, { kind: "ambiguous" }, { kind: "unavailable" }, { kind: "continuation", record: proof },
    ]) expect(httpRoutes["POST /api/session"].request.safeParse({ protocolVersion: 1, page }).success).toBe(true);
    for (const edit of [{ continuationToken: "x" }, { previousTabId: undefined }, { draft: "unsent" }])
      expect(continuationRecord.safeParse({ ...proof, ...edit }).success).toBe(false);
  });
});
