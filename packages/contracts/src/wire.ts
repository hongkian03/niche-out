import { z } from "zod";
import { codePointCount, collapseWhitespace } from "./text.js";

export const protocolVersion = z.literal(2);
export const id = z.string().min(1);
export const nonnegative = z.int().nonnegative();
export const promptCount = z.int().min(1).max(20);
export const playerCount = z.int().min(0).max(100);
export const code = z.string().regex(/^\d{6}$/);
export const nicknameInput = z.string().refine((value) => {
  const length = codePointCount(collapseWhitespace(value));
  return length >= 1 && length <= 32;
}, "Nickname must contain 1–32 code points after spaces are collapsed.");
export const nickname = nicknameInput.refine(
  (value) => value === collapseWhitespace(value),
  "Displayed nickname must use its admitted spacing.",
);

// Canonical unpadded base64url encoding of 32 bytes (two zero padding bits).
export const secret = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
export const requestPrefix = z.string().regex(/^[A-Za-z0-9_-]+$/);
export const requestId = z.string().regex(/^[A-Za-z0-9_-]+\.[1-9][0-9]*$/).refine(
  (value) => Number.isSafeInteger(Number(value.slice(value.lastIndexOf(".") + 1))),
  "Request sequence must be a positive safe integer.",
);
export const empty = z.strictObject({});
export const requestContext = {
  protocolVersion,
  serverInstanceId: id,
  tabId: id,
  requestId,
};
export const committedGame = z.strictObject({
  requestId, candidateId: id, gameId: id, setupGeneration: nonnegative, revision: nonnegative,
});
export const continuationRecord = z.strictObject({
  serverInstanceId: id, gameId: id, previousTabId: id, continuationToken: secret,
});
export const controlGrant = z.strictObject({
  controlGeneration: nonnegative,
  continuation: continuationRecord,
});
export const continuationInput = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("fresh") }),
  z.strictObject({ kind: z.literal("unavailable") }),
  z.strictObject({ kind: z.literal("ambiguous") }),
  z.strictObject({ kind: z.literal("continuation"), record: continuationRecord }),
]);
