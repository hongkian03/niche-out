import { randomBytes, randomUUID } from "node:crypto";

const token = () => randomBytes(32).toString("base64url");

// One synthetic admitted member, one browser cookie, one game. The probe
// exercises transfer semantics in isolation. E3 owns admission and expiry.
export function makeMembership(sessionToken) {
  const pages = new Map();
  const serverInstanceId = randomUUID();
  const gameId = randomUUID();
  let current;
  let generation = 0;
  let continuation;
  function matches(record) {
    return continuation && record?.serverInstanceId === serverInstanceId &&
      record.gameId === gameId && record.previousTabId === current &&
      record.continuationToken === continuation.continuationToken;
  }
  return {
    sessionToken, gameId, serverInstanceId,
    bootstrap(input) {
      const tabId = randomUUID();
      const requestPrefix = randomUUID();
      const classification = input.kind === "fresh" ? "fresh" :
        matches(input.record) ? "continuation" : "confirmation-required";
      pages.set(tabId, { input, requestPrefix, used: false });
      return { protocolVersion: 1, serverInstanceId, role: "player", tabId, requestPrefix,
        hostGameId: null, lastGameCommit: null, resume: classification,
        membership: { gameId, playerId: "probe-member", nickname: "Probe", status: "admitted" } };
    },
    command({ tabId, requestId, gameId: requestedGame, serverInstanceId: instance, payload }, kind) {
      const page = pages.get(tabId);
      if (!page || requestedGame !== gameId || instance !== serverInstanceId ||
          !requestId.startsWith(page.requestPrefix + ".")) return { error: "UNAUTHORIZED" };
      // An old successful reply must never confer control after supersession.
      if (kind === "game.resume" && page.used && current !== tabId) return { error: "TAB_SUPERSEDED" };
      if (page.last?.requestId === requestId) {
        return page.last.kind === kind && page.last.body === JSON.stringify(payload)
          ? page.last.result : { error: "REQUEST_ID_REUSE" };
      }
      if (kind === "player.claimControl" && payload.explicit !== true) return { error: "INVALID_PAYLOAD" };
      if (kind === "game.resume" && current !== tabId) {
        if (payload.mode === "loaded") return { error: "TAB_SUPERSEDED" };
        if (page.input.kind !== "fresh" && !matches(page.input.record)) {
          return { error: "CONTROL_CONFIRMATION_REQUIRED" };
        }
      }
      if (current !== tabId) {
        current = tabId;
        generation++;
        continuation = { serverInstanceId, gameId, previousTabId: tabId, continuationToken: token() };
      }
      page.used = true;
      const result = { controlGeneration: generation, continuation };
      page.last = { requestId, kind, body: JSON.stringify(payload), result };
      return result;
    },
    state() { return { current, generation }; }
  };
}
