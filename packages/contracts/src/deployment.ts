import { z } from "zod";
import { code } from "./wire.js";

/** Canonical origin only. Hostname ownership is verified by deployment setup. */
export const publicOriginSchema = z.string().max(2048).refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  const labels = url.hostname.split(".");
  const dns = labels.length >= 2 && url.hostname.length <= 253 &&
    labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) &&
    /[a-z]/.test(labels.at(-1)!);
  return dns && url.protocol === "https:" && url.origin === value &&
    !url.hostname.endsWith(".localhost") && !url.hostname.endsWith(".local") &&
    !url.username && !url.password && !url.search && !url.hash;
}, "Use one canonical public HTTPS DNS origin, without a path, credentials, query or fragment.");

export const deploymentConfigSchema = z.strictObject({
  mode: z.literal("tunnel"),
  purpose: z.enum(["probe", "event"]),
  provider: z.literal("cloudflare"),
  tunnelKind: z.enum(["named", "quick"]),
  publicOrigin: publicOriginSchema,
  listen: z.strictObject({ host: z.literal("127.0.0.1"), port: z.int().min(1).max(65535) }),
  upstreamHost: z.enum(["public", "loopback"]),
});
export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;

export const secureSessionCookieOptions = {
  secure: true, httpOnly: true, sameSite: "strict", path: "/",
} as const;

export interface TunnelIngress {
  peerAddress: string | undefined;
  host: string | undefined;
  origin: string | undefined;
  method: string | undefined;
  upgrade?: boolean;
}

/** Transport check only. Every operation still requires role authorization.
 * Forwarded headers are unused until a provider path proves overwrite semantics.
 * Local callers cannot gain host authority through this check.
 */
export function checkTunnelIngress(config: DeploymentConfig, request: TunnelIngress): boolean {
  const expectedHost = config.upstreamHost === "public" ? new URL(config.publicOrigin).host :
    config.listen.host + ":" + config.listen.port;
  if (request.peerAddress !== "127.0.0.1" || request.host !== expectedHost) return false;
  if (request.origin !== undefined) return request.origin === config.publicOrigin;
  return request.upgrade !== true && (request.method === "GET" || request.method === "HEAD");
}

export const invitationSchema = z.strictObject({ code, joinUrl: z.string(), qrPayload: z.string() })
  .refine(value => {
    if (!URL.canParse(value.joinUrl)) return false;
    const join = new URL(value.joinUrl);
    return publicOriginSchema.safeParse(join.origin).success &&
      value.joinUrl === join.origin + "/join" && value.qrPayload === value.joinUrl + "?code=" + value.code;
  }, "Invitation must use a public HTTPS origin and the exact join route and code.");
export type Invitation = z.infer<typeof invitationSchema>;

export function invitationForOrigin(origin: string, gameCode: string): Invitation {
  const publicOrigin = publicOriginSchema.parse(origin);
  return invitationSchema.parse({ code: gameCode, joinUrl: publicOrigin + "/join",
    qrPayload: publicOrigin + "/join?code=" + gameCode });
}

export function invitationMatchesOrigin(invitation: unknown, origin: string): boolean {
  const parsed = invitationSchema.safeParse(invitation);
  return publicOriginSchema.safeParse(origin).success && parsed.success &&
    parsed.data.joinUrl === origin + "/join";
}

// Host-only facts. No raw provider messages, token, secret path or client IP.
export const hostingStatusSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("starting") }),
  z.strictObject({ status: z.literal("connecting") }),
  z.strictObject({ status: z.literal("ready"), publicOrigin: publicOriginSchema }),
  z.strictObject({ status: z.literal("reconnecting"), publicOrigin: publicOriginSchema }),
  z.strictObject({ status: z.literal("failed"), reason: z.enum([
    "configuration", "credentials", "unreachable", "provider-limit", "connector-exited",
  ]) }),
]);
export type HostingStatus = z.infer<typeof hostingStatusSchema>;

/** Host network changes are irrelevant while the configured browser origin survives. */
export function requiresFreshGame(previousOrigin: string, nextOrigin: string): boolean {
  return publicOriginSchema.parse(previousOrigin) !== publicOriginSchema.parse(nextOrigin);
}

/** Local controller state, separate from player snapshots. */
export const sessionHostingStateSchema = z.discriminatedUnion("status", [
  z.strictObject({status:z.literal("idle"),sessionId:z.null(),publicOrigin:z.null()}),
  ...(["starting","connecting","stopping"] as const).map(status => z.strictObject({status:z.literal(status),sessionId:z.string().min(1),publicOrigin:z.null()})),
  ...(["ready","reconnecting"] as const).map(status => z.strictObject({status:z.literal(status),sessionId:z.string().min(1),publicOrigin:publicOriginSchema})),
  z.strictObject({status:z.literal("failed"),sessionId:z.string().min(1),publicOrigin:z.null(),reason:z.enum(["startup-failed","startup-timeout","connector-exited","endpoint-lost","connector-missing","connector-integrity","unsupported-platform"])})
]);
export type SessionHostingState = z.infer<typeof sessionHostingStateSchema>;
