import { describe, expect, it } from "vitest";
import {
  publicOriginSchema, deploymentConfigSchema, checkTunnelIngress, invitationForOrigin,
  invitationMatchesOrigin, invitationSchema, secureSessionCookieOptions, hostingStatusSchema, requiresFreshGame,
} from "../../packages/contracts/src/deployment.js";
import { completeView, serverEvents } from "../../packages/contracts/src/views.js";
import { httpStatusForError, failure } from "../../packages/contracts/src/protocol.js";
import { lobby, allViews } from "../protocol/view-fixtures.js";

const origin = "https://game.example.com";
const config = deploymentConfigSchema.parse({
  mode: "tunnel", purpose: "event", provider: "cloudflare", tunnelKind: "named", publicOrigin: origin,
  listen: { host: "127.0.0.1", port: 3210 }, upstreamHost: "public",
});
const request = { peerAddress: "127.0.0.1", host: "game.example.com", origin, method: "POST" };

describe("public deployment configuration", () => {
  it.each([
    "http://game.example.com", "https://192.168.1.2", "https://127.0.0.1", "https://[::1]",
    "https://localhost", "https://host.local", "https://host.localhost", "https://*.example.com",
    "https://user:secret@example.com", "https://game.example.com/", "https://game.example.com/host",
    "https://game.example.com?secret=x", "https://game.example.com#secret", "https://game.example.com.",
    "https://game.example.com:443", "https://Game.example.com", " https://game.example.com", "not a URL",
  ])("rejects ambiguous or non-public canonical origin %s", value => {
    expect(publicOriginSchema.safeParse(value).success).toBe(false);
  });
  it("permits canonical DNS origins and explicit non-default ports", () => {
    expect(publicOriginSchema.parse(origin)).toBe(origin);
    expect(publicOriginSchema.parse(origin + ":8443")).toBe(origin + ":8443");
  });
  it("rejects wildcard listeners, unchosen provider, unknown nested fields", () => {
    for (const bad of [
      { ...config, listen: { host: "0.0.0.0", port: 3210 } },
      { ...config, listen: { host: "127.0.0.1", port: 0 } },
      { ...config, listen: { ...config.listen, trustProxy: true } },
      { ...config, provider: "unreviewed" },
      { ...config, token: "secret" },
    ]) expect(deploymentConfigSchema.safeParse(bad).success).toBe(false);
    expect(deploymentConfigSchema.safeParse({ ...config, purpose: "probe", tunnelKind: "quick" }).success).toBe(true);
    expect(deploymentConfigSchema.safeParse({ ...config, purpose: "event", tunnelKind: "quick" }).success).toBe(true);
    const bad = deploymentConfigSchema.safeParse({ ...config, listen: { host: "0.0.0.0", port: 3210 } });
    expect(bad.success ? [] : bad.error.issues[0]?.path).toEqual(["listen", "host"]);
  });
});

describe("transport boundary", () => {
  it("requires the documented peer, exact upstream Host and browser Origin", () => {
    expect(checkTunnelIngress(config, request)).toBe(true);
    for (const edit of [
      { peerAddress: "192.168.1.2" }, { peerAddress: undefined }, { host: "evil.example" },
      { host: "game.example.com,evil.example" }, { host: undefined },
      { origin: "https://evil.example" }, { origin: "null" }, { origin: undefined },
    ]) expect(checkTunnelIngress(config, { ...request, ...edit })).toBe(false);
    expect(checkTunnelIngress({ ...config, upstreamHost: "loopback" }, request)).toBe(false);
    expect(checkTunnelIngress({ ...config, upstreamHost: "loopback" }, { ...request, host: "127.0.0.1:3210" })).toBe(true);
  });
  it("permits absent Origin only for navigation/read GET and HEAD, never an upgrade", () => {
    for (const method of ["GET", "HEAD"]) {
      expect(checkTunnelIngress(config, { ...request, method, origin: undefined })).toBe(true);
      expect(checkTunnelIngress(config, { ...request, method, origin: undefined, upgrade: true })).toBe(false);
    }
    expect(checkTunnelIngress(config, { ...request, method: "GET", upgrade: true })).toBe(true);
  });
  it("forwarded headers do not repair a forbidden request or determine secure-cookie policy", () => {
    const forged = { ...request, host: "evil.example", forwardedHost: "game.example.com", forwardedFor: "127.0.0.1" };
    expect(checkTunnelIngress(config, forged)).toBe(false);
    expect(secureSessionCookieOptions).toEqual({ secure: true, httpOnly: true, sameSite: "strict", path: "/" });
    expect(secureSessionCookieOptions).not.toHaveProperty("domain");
  });
});

describe("public invitations and host-only readiness", () => {
  it("constructs links from validated configuration and retains leading zeroes", () => {
    const invitation = invitationForOrigin(origin, "001234");
    expect(invitation.qrPayload).toBe(origin + "/join?code=001234");
    expect(invitationMatchesOrigin(invitation, origin)).toBe(true);
    expect(invitationMatchesOrigin(invitation, "https://other.example.com")).toBe(false);
    expect(() => invitationForOrigin(origin, "1234")).toThrow();
    for (const edit of [
      { joinUrl: origin + "/host" }, { qrPayload: origin + "/join?code=001234#secret" },
      { qrPayload: "https://other.example.com/join?code=001234" }, { token: "secret" },
    ]) expect(invitationSchema.safeParse({ ...invitation, ...edit }).success).toBe(false);
  });
  it("keeps Start unavailable through outage while preserving legitimate Lobby context", () => {
    const reconnecting = { status: "reconnecting", publicOrigin: origin };
    expect(completeView.safeParse({ ...lobby, hosting: reconnecting, canStart: false }).success).toBe(true);
    expect(completeView.safeParse({ ...lobby, hosting: reconnecting, canStart: true }).success).toBe(false);
    expect(completeView.safeParse({ ...lobby, hosting: { status: "ready", publicOrigin: "https://evil.example" } }).success).toBe(false);
    expect(failure.safeParse({ code: "TUNNEL_NOT_READY", message: "Waiting for connection." }).success).toBe(true);
    expect(httpStatusForError.TUNNEL_NOT_READY).toBe(503);
  });
  it("only exposes sanitized hosting states to hosts", () => {
    for (const status of [{ status: "starting" }, { status: "connecting" },
      { status: "ready", publicOrigin: origin }, { status: "reconnecting", publicOrigin: origin },
      { status: "failed", reason: "credentials" }]) {
      expect(hostingStatusSchema.safeParse(status).success).toBe(true);
      expect(hostingStatusSchema.safeParse({ ...status, providerOutput: "token=secret" }).success).toBe(false);
    }
    for (const view of allViews.filter(v => v.viewRole === "player")) {
      expect(completeView.safeParse({ ...view, hosting: { status: "ready", publicOrigin: origin } }).success).toBe(false);
    }
  });
  it("distinguishes public origin replacement from same-origin reconnect", () => {
    expect(requiresFreshGame(origin, origin)).toBe(false);
    expect(requiresFreshGame(origin, "https://other.example.com")).toBe(true);
    expect(requiresFreshGame(origin, origin + ":8443")).toBe(true);
    expect(serverEvents["game.closed"].safeParse({ protocolVersion: 1, serverInstanceId: "s", gameId: "g",
      revision: 3, reason: "public-origin-changed" }).success).toBe(true);
  });
});
