import { z } from "zod";
import {
  id, protocolVersion, committedGame, requestPrefix, continuationInput, nickname,
} from "./wire.js";

export { continuationRecord, controlGrant } from "./wire.js";

// A full-document bootstrap gets a new page. "ambiguous" includes a malformed
// persisted record: clients preserve that distinction instead of sending "fresh".
export const sessionRequest = z.strictObject({ protocolVersion, page: continuationInput });
const sessionBase = { protocolVersion, serverInstanceId: id, tabId: id, requestPrefix };
const noMembership = { membership: z.null(), resume: z.literal("none") };
export const hostSession = z.strictObject({
  ...sessionBase, ...noMembership, role: z.literal("host"),
  hostGameId: id.nullable(), lastGameCommit: committedGame.nullable(),
}).refine((view) => view.hostGameId === (view.lastGameCommit?.gameId ?? null), {
  message: "The host commit descriptor must identify the current game.", path: ["lastGameCommit"],
});
const membershipFields = { gameId: id, playerId: id, nickname };
const playerSession = z.strictObject({
  ...sessionBase, role: z.literal("player"), hostGameId: z.null(), lastGameCommit: z.null(),
  membership: z.strictObject({ ...membershipFields, status: z.enum(["admitted", "removed"]) }),
  resume: z.enum(["none", "fresh", "continuation", "confirmation-required"]),
}).refine((view) => (view.membership.status === "removed") === (view.resume === "none"), {
  message: "Only admitted players receive a resume classification.", path: ["resume"],
});
export const sessionResponse = z.discriminatedUnion("role", [
  hostSession, playerSession,
  z.strictObject({
    ...sessionBase, ...noMembership, role: z.literal("guest"), hostGameId: z.null(), lastGameCommit: z.null(),
  }),
]);
export type SessionResponse = z.infer<typeof sessionResponse>;
