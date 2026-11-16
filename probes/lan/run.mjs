import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { createServer, get } from "node:http";
import { setTimeout as wait } from "node:timers/promises";
import { once } from "node:events";
import { Server } from "socket.io";
import { launchBrowser } from "../browser.mjs";
import { selectedInterface, makePeerCheck, allowedRequest } from "./policy.mjs";

const clientAsset = createRequire(import.meta.url).resolve("socket.io-client/dist/socket.io.js");
const nic = selectedInterface();
const peerCheck = makePeerCheck(nic);
const peerArgument = process.argv.find(arg => arg.startsWith("--peer="));
const extraPeer = peerArgument?.slice("--peer=".length);
if (peerArgument && !peerCheck(extraPeer)) throw new Error("Specify one IPv4 phone address inside the selected subnet.");
const cookie = "probe=" + randomBytes(32).toString("hex");
const observed = new Set();
let origin;
function authorize(req) {
  const kind = new URL(req.url, origin).searchParams.get("transport") ?? "http";
  const valid = allowedRequest({
    host: req.headers.host, origin: req.headers.origin, method: req.method, peer: req.socket.remoteAddress
  }, origin, peerCheck);
  // The manual test admits only the one explicitly selected second device.
  const local = req.socket.remoteAddress === nic.address || req.socket.remoteAddress === extraPeer;
  const upgradeOriginValid = kind !== "websocket" || req.headers.origin === origin;
  const hasCookie = (req.headers.cookie ?? "").split("; ").includes(cookie);
  const accepted = valid && local && upgradeOriginValid && (kind === "http" || hasCookie);
  observed.add([kind, req.method, "origin=" + (req.headers.origin === undefined ? "absent" :
    req.headers.origin === origin ? "same" : "other"), "cookie=" + hasCookie, "accepted=" + accepted].join(" "));
  return accepted;
}
const manualClient = `<script>
const output = document.querySelector("output");
const socket = io({ autoConnect: false, transports: ["polling","websocket"], reconnection: false });
socket.on("connect_error", error => { output.textContent = "Connection failed: " + error.message; });
socket.connect();
const initial = socket.io.engine.transport.name;
socket.io.engine.on("upgrade", async transport => {
  try {
    const ack = await socket.timeout(2000).emitWithAck("probe");
    output.textContent = initial + " → " + transport.name + " → " + ack;
  } catch { output.textContent = "Acknowledgement timed out"; }
});
</script>`;
const server = createServer((req, res) => {
  if (!authorize(req)) { res.writeHead(403).end(); return; }
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Set-Cookie": cookie + "; Path=/; HttpOnly; SameSite=Strict",
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end('<!doctype html><title>LAN probe</title><output>Connecting…</output><script src="/client.js"></script>' +
      (extraPeer ? manualClient : ""));
  } else if (req.method === "GET" && req.url === "/client.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" });
    createReadStream(clientAsset).pipe(res);
  } else { res.writeHead(404).end(); }
});
const io = new Server(server, { serveClient: false });
io.engine.use((req, res, next) => {
  if (!authorize(req)) { res.writeHead(403).end(); return; }
  next();
});
io.on("connection", socket => socket.on("probe", ack => ack("ok")));
let browser;
try {
  server.listen(0, nic.address);
  await once(server, "listening");
  origin = "http://" + nic.address + ":" + server.address().port;
  const valid = { method: "GET", peer: nic.address, host: new URL(origin).host };
  assert(allowedRequest(valid, origin, peerCheck));
  assert(!allowedRequest({ ...valid, method: "POST" }, origin, peerCheck));
  assert(!allowedRequest({ ...valid, host: "elsewhere.invalid" }, origin, peerCheck));
  assert(!allowedRequest({ ...valid, origin: "http://elsewhere.invalid" }, origin, peerCheck));
  assert(!allowedRequest({ ...valid, peer: "203.0.113.10" }, origin, peerCheck));
  // Exercise HTTP and engine handling on the actual selected listener.
  const wrongHost = await new Promise((resolve, reject) => {
    get(origin, { headers: { host: "invalid.example" } }, res => {
      res.resume(); resolve(res.statusCode);
    }).on("error", reject);
  });
  assert.equal(wrongHost, 403);
  assert.equal((await fetch(origin + "/socket.io/?EIO=4&transport=polling",
    { headers: { origin: "http://elsewhere.invalid" } })).status, 403);
  assert.equal((await fetch(origin + "/socket.io/?EIO=4&transport=polling")).status, 403);
  if (extraPeer) {
    console.log("Open this address on the selected phone:", origin);
    console.log("The diagnostic expires in five minutes. Ctrl-C ends it sooner.");
    await wait(300_000);
    console.log([...observed].sort().join("\n"));
  } else {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(origin);
    const transitions = await page.evaluate(async () => {
      if (document.cookie.includes("probe=")) throw new Error("Probe cookie visible to script");
      const socket = io({ autoConnect: false, transports: ["polling","websocket"], reconnection: false });
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Upgrade or acknowledgement timed out")), 8000);
        socket.on("connect_error", reject);
        socket.connect();
        const initial = socket.io.engine.transport.name;
        socket.io.engine.once("upgrade", async upgraded => {
          try {
            const ack = await socket.timeout(2000).emitWithAck("probe");
            clearTimeout(timer);
            socket.disconnect();
            resolve([initial, upgraded.name, ack]);
          } catch (err) { reject(err); }
        });
      });
    });
    assert.deepEqual(transitions, ["polling","websocket","ok"]);
    console.log(JSON.stringify({ browser: browser.version(), interface: nic.name,
      subnetPrefix: nic.cidr.split("/")[1], transitions, observed: [...observed].sort() }, null, 2));
  }
} finally {
  await browser?.close();
  await io.close();
}
