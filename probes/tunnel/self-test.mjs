import assert from "node:assert/strict";
import { request } from "node:http";
import { once } from "node:events";
import { createProbeServer } from "./server.mjs";

export async function selfTest() {
  const app = createProbeServer();
  const origin = "https://probe.example";
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const port = app.server.address().port;
  app.configure({ mode: "tunnel", purpose: "probe", provider: "cloudflare", tunnelKind: "quick",
    publicOrigin: origin, listen: { host: "127.0.0.1", port }, upstreamHost: "public" });
  function call(path, { method = "GET", headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port, path, method, headers: { Host: "probe.example", ...headers } },
        res => {
          const chunks = [];
          res.on("data", chunk => chunks.push(chunk)).on("end", () => resolve({
            status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString()
          }));
        });
      req.on("error", reject);
      req.end(body);
    });
  }
  try {
    assert.equal((await call("/health")).status, 200);
    assert.equal((await call("/health", { headers: { Host: "foreign.example" } })).status, 403);
    assert.equal((await call("/session", { method: "POST", body: "{}" })).status, 403);
    assert.equal((await call("/session", { method: "POST", headers: { Origin: "https://foreign.example",
      "X-Forwarded-Host": "probe.example", "X-Forwarded-Proto": "https" }, body: "{}" })).status, 403);
    assert.equal((await call("/upload", { method: "POST", headers: { Origin: origin }, body: "data" })).status, 401);
    const session = await call("/session", { method: "POST", headers: { Origin: origin },
      body: JSON.stringify({ protocolVersion: 2, page: { kind: "fresh" } }) });
    assert.equal(session.status, 200);
    const cookie = session.headers["set-cookie"][0];
    assert(cookie.includes("Secure") && cookie.includes("HttpOnly") && cookie.includes("SameSite=Strict"));
    const sessionBody = JSON.parse(session.body);
    const envelope = { protocolVersion: 2, serverInstanceId: sessionBody.serverInstanceId,
      gameId: sessionBody.membership.gameId, tabId: sessionBody.tabId,
      requestId: sessionBody.requestPrefix + ".1", payload: { mode: "bootstrap" } };
    const headers = { Origin: origin, Cookie: cookie.split(";")[0] };
    const accepted = await call("/game.resume", { method: "POST", headers, body: JSON.stringify(envelope) });
    assert.equal(JSON.parse(accepted.body).controlGeneration, 1);
    assert.equal((await call("/game.resume", { method: "POST", headers, body: JSON.stringify(envelope) })).body, accepted.body);
    assert.equal((await call("/session", { method: "POST", headers, body: "x".repeat(4097) })).status, 413);
    assert.equal((await call("/upload", { method: "POST", headers, body: Buffer.alloc(10 * 1024 * 1024) })).status, 200);
    assert.equal((await call("/upload", { method: "POST", headers, body: Buffer.alloc(10 * 1024 * 1024 + 1) })).status, 413);
    assert.equal((await call("/api/owner/exchange", { method: "POST", headers, body: "{}" })).status, 404);
    console.log("PASS local probe policy, cookies, authorization, same-ID recovery and body limits.");
  } finally { await app.close(); }
}
