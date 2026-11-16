import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Server } from "socket.io";
import {
  deploymentConfigSchema, checkTunnelIngress, sessionRequest, sessionResponse,
  socketCommands, controlGrant
} from "@rarity/contracts";
import { makeMembership } from "../tabs/controller.mjs";

const client = readFileSync(createRequire(import.meta.url).resolve("socket.io-client/dist/socket.io.js"));
const pageScript = readFileSync(new URL("page.js", import.meta.url));
const html = readFileSync(new URL("page.html", import.meta.url));
const cookieName = "__Host-niche-probe";
const uploadLimit = 10 * 1024 * 1024;
function reply(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" })
    .end(JSON.stringify(value));
}
async function readBody(req, limit) {
  const chunks = [];
  let bytes = 0;
  const timer = setTimeout(() => req.destroy(new Error("Body timeout")), 10_000);
  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > limit) throw Object.assign(new Error("Body limit"), { status: 413 });
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally { clearTimeout(timer); }
}

/** Synthetic membership experiment, deliberately separate from product routes. */
export function createProbeServer() {
  let config;
  const sessions = new Map();
  const observations = new Set();
  const usage = new Map();
  let acceptedEvents = 0;
  let uploading = false;
  let denied = 0;
  function permit(req) {
    if (!config) return false;
    const accepted = checkTunnelIngress(config, {
      peerAddress: req.socket.remoteAddress, host: req.headers.host,
      origin: req.headers.origin, method: req.method,
      upgrade: req.headers.upgrade?.toLowerCase() === "websocket"
    });
    let rawTransport;
    try { rawTransport = new URL(req.url, config.publicOrigin).searchParams.get("transport"); }
    catch { return false; }
    const transport = rawTransport === null ? "http" :
      ["polling","websocket"].includes(rawTransport) ? rawTransport : "other";
    const observedOrigin = req.headers.origin === undefined ? "absent" :
      req.headers.origin === config.publicOrigin ? "same" : "other";
    if (observations.size < 64) observations.add(JSON.stringify({ transport, method: req.method, origin: observedOrigin,
      hostMatchesPublic: req.headers.host === new URL(config.publicOrigin).host,
      forwardedProto: req.headers["x-forwarded-proto"] === "https" ? "https" : "other-or-absent",
      hasForwardedFor: req.headers["x-forwarded-for"] !== undefined, accepted }));
    if (!accepted) denied++;
    return accepted;
  }
  function session(req) {
    const raw = (req.headers.cookie ?? "").split(";").map(part => part.trim())
      .find(part => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
    return sessions.get(raw);
  }
  function withinRate(key, limit) {
    const second = Math.floor(Date.now() / 1000);
    const previous = usage.get(key);
    const current = previous?.second === second ? previous : { second, count: 0 };
    current.count++;
    usage.set(key, current);
    return current.count <= limit;
  }
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!permit(req)) return reply(res, 403, { code: "FORBIDDEN" });
    if (!withinRate("global", 150)) return reply(res, 429, { code: "RATE_LIMITED" });
    const path = new URL(req.url, config.publicOrigin).pathname;
    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html); return;
    }
    if (req.method === "GET" && path === "/health") return reply(res, 200, { probe: "niche-tunnel-v1", ready: true });
    if (req.method === "GET" && ["/client.js","/page.js"].includes(path)) {
      res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" })
        .end(path === "/client.js" ? client : pageScript); return;
    }
    if (req.method === "POST" && path === "/session") {
      if (!withinRate("session", 12)) return reply(res, 429, { code: "RATE_LIMITED" });
      try {
        const input = sessionRequest.parse(JSON.parse(await readBody(req, 4096)));
        let actor = session(req);
        if (!actor) {
          if (sessions.size >= 32) return reply(res, 503, { code: "SESSION_CAPACITY" });
          const secret = randomBytes(32).toString("base64url");
          actor = { member: makeMembership(secret), pages: 0, connections: 0 };
          sessions.set(secret, actor);
          res.setHeader("Set-Cookie", cookieName + "=" + secret + "; Path=/; Secure; HttpOnly; SameSite=Strict");
        }
        if (actor.pages >= 8) return reply(res, 503, { code: "PAGE_CAPACITY" });
        actor.pages++;
        return reply(res, 200, sessionResponse.parse(actor.member.bootstrap(input.page)));
      } catch (error) { return reply(res, error.status ?? 400, { code: error.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_PAYLOAD" }); }
    }
    const actor = session(req);
    if (!actor) return reply(res, 401, { code: "UNAUTHORIZED" });
    if (!withinRate(actor.member.sessionToken, 20)) return reply(res, 429, { code: "RATE_LIMITED" });
    if (req.method === "POST" && ["/game.resume","/player.claimControl"].includes(path)) {
      try {
        const kind = path.slice(1);
        const command = socketCommands[kind].parse(JSON.parse(await readBody(req, 4096)));
        const result = actor.member.command(command, kind);
        if (!result.error) controlGrant.parse(result);
        return reply(res, 200, result);
      } catch (error) { return reply(res, error.status ?? 400, { code: error.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_PAYLOAD" }); }
    }
    if (req.method === "POST" && path === "/upload") {
      if (uploading) return reply(res, 503, { code: "IMPORT_IN_PROGRESS" });
      uploading = true;
      try {
        const bytes = await readBody(req, uploadLimit);
        return reply(res, 200, { bytes: bytes.length, committedStatePreserved: true });
      } catch (error) { return reply(res, error.status ?? 400, { code: "UPLOAD_TOO_LARGE", committedStatePreserved: true }); }
      finally { uploading = false; }
    }
    // Product owner/admin routes do not exist in this synthetic experiment.
    reply(res, 404, { code: "NOT_FOUND" });
  });
  const io = new Server(server, { serveClient: false, maxHttpBufferSize: 4096, pingInterval: 5000, pingTimeout: 5000 });
  io.engine.use((req, res, next) => {
    if (!permit(req)) { reply(res, 403, { code: "FORBIDDEN" }); return; }
    const actor = session(req);
    if (!actor) { reply(res, 401, { code: "UNAUTHORIZED" }); return; }
    const hasSessionId = new URL(req.url, config.publicOrigin).searchParams.has("sid");
    if (!hasSessionId && (io.engine.clientsCount >= 128 || actor.connections >= 8)) {
      reply(res, 503, { code: "CONNECTION_CAPACITY" }); return;
    }
    if (!withinRate("transport", 300)) { reply(res, 429, { code: "RATE_LIMITED" }); return; }
    next();
  });
  io.engine.on("connection", transport => {
    const actor = session(transport.request);
    actor.connections++;
    transport.once("close", () => { actor.connections--; });
  });
  io.on("connection", socket => {
    socket.on("probe", ack => {
      if (typeof ack !== "function") return;
      const actor = session(socket.request);
      if (!actor || !withinRate(actor.member.sessionToken, 20)) return ack({ ok: false, code: "RATE_LIMITED" });
      acceptedEvents++;
      ack({ ok: true });
    });
  });
  return {
    server,
    configure(value) { config = deploymentConfigSchema.parse(value); },
    report() { return { acceptedEvents, denied, sessions: sessions.size, observations: [...observations].map(JSON.parse) }; },
    async close() { await io.close(); server.closeAllConnections(); }
  };
}
