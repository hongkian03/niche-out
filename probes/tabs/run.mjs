import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { sessionRequest, sessionResponse, socketCommands, controlGrant } from "@rarity/contracts";
import { setTimeout as wait } from "node:timers/promises";
import { launchBrowser } from "../browser.mjs";
import { allowedRequest, makePeerCheck, selectedInterface } from "../lan/policy.mjs";
import { makeMembership } from "./controller.mjs";

const nic = selectedInterface();
const peerCheck = makePeerCheck(nic);
const cookie = randomBytes(32).toString("base64url");
const member = makeMembership(cookie);
const script = readFileSync(new URL("page.js", import.meta.url));
let origin;
const server = createServer(async (req, res) => {
  const sameMachine = req.socket.remoteAddress === nic.address;
  if (!sameMachine || !allowedRequest({ host: req.headers.host, origin: req.headers.origin,
    method: req.method, peer: req.socket.remoteAddress }, origin, peerCheck)) {
    res.writeHead(403).end(); return;
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Set-Cookie": "tabprobe=" + cookie + "; HttpOnly; SameSite=Strict; Path=/",
      "Content-Type": "text/html; charset=utf-8" }).end('<!doctype html><title>Tab probe</title><label>Temporary draft <input></label><button id="check">Check current control</button> <button id="claim">Take control here</button> <output></output><script src="/probe.js"></script>');
    return;
  }
  if (!(req.headers.cookie ?? "").split("; ").includes("tabprobe=" + member.sessionToken)) {
    res.writeHead(401).end(); return;
  }
  if (req.method === "GET" && req.url === "/probe.js") {
    res.writeHead(200, { "Content-Type": "text/javascript" }).end(script); return;
  }
  if (req.method !== "POST" || !["/session","/game.resume","/player.claimControl"].includes(req.url)) {
    res.writeHead(404).end(); return;
  }
  try {
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 4096) { res.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    let result;
    if (req.url === "/session") {
      const discovery = sessionRequest.parse(input);
      result = sessionResponse.parse(member.bootstrap(discovery.page));
    } else {
      const kind = req.url.slice(1);
      result = member.command(socketCommands[kind].parse(input), kind);
      if (!result.error) controlGrant.parse(result);
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
  } catch { res.writeHead(400).end(); }
});
const boot = page => page.evaluate(async () => (await window.probeReady).tabId);
const cmd = (page, ...args) => page.evaluate(args => window.probeCommand(...args), args);
async function copy(page) {
  const popup = page.waitForEvent("popup");
  await page.evaluate(() => { window.open(location.origin, "_blank"); });
  const copy = await popup;
  await copy.waitForLoadState();
  await boot(copy);
  return copy;
}
let browser;
try {
  server.listen(0, nic.address);
  await once(server, "listening");
  origin = "http://" + nic.address + ":" + server.address().port;
  if (process.argv.includes("--manual")) {
    console.log("Open this address on the host in a private browser window:", origin + "/#manual");
    console.log("The isolated probe expires after five minutes. Ctrl-C ends it sooner.");
    await wait(300_000);
  } else {
    browser = await launchBrowser();
    const context = await browser.newContext();
    const first = await context.newPage();
    await first.goto(origin);
    const initialPage = await boot(first);
    assert.equal((await cmd(first)).generation, 1);
    assert.equal((await cmd(first, "game.resume", "loaded")).generation, 1);
    await first.locator("input").fill("invented private test draft");
    await first.reload();
    assert.notEqual(await boot(first), initialPage);
    assert.equal(await first.locator("input").inputValue(), "");
    assert.equal((await cmd(first)).generation, 2);
    const keys = await first.evaluate(() => Object.keys(JSON.parse(sessionStorage.getItem("control"))).sort());
    assert.deepEqual(keys, ["continuationToken","gameId","previousTabId","serverInstanceId"]);
    const a = await copy(first);
    const b = await copy(first);
    assert.notEqual(await boot(a), await boot(b));
    const results = await Promise.all([cmd(a), cmd(b)]);
    assert.equal(results.filter(r => r.generation === 3).length, 1);
    assert.equal(results.filter(r => r.error === "CONTROL_CONFIRMATION_REQUIRED").length, 1);
    const winner = results[0].generation === 3 ? a : b;
    const loser = winner === a ? b : a;
    assert.equal((await cmd(first, "game.resume", "loaded")).error, "TAB_SUPERSEDED");
    const stale = await copy(first);
    assert.equal((await cmd(stale)).error, "CONTROL_CONFIRMATION_REQUIRED");
    await cmd(loser, "player.claimControl", "bootstrap", false, true);
    assert.equal((await cmd(loser, "player.claimControl", "bootstrap", true)).generation, 4);
    assert.equal((await cmd(winner, "game.resume", "loaded")).error, "TAB_SUPERSEDED");
    const withoutOpener = await context.newPage();
    await withoutOpener.goto(origin);
    await boot(withoutOpener);
    await cmd(withoutOpener, "game.resume", "bootstrap", false, true);
    assert.equal((await cmd(withoutOpener, "game.resume", "bootstrap", true)).generation, 5);
    assert.deepEqual(member.state(), { current: await boot(withoutOpener), generation: 5 });
    console.log(JSON.stringify({ browser: browser.version(), generations: [1,1,2,3,4,5],
      scenarios: ["initial", "loaded reconnect", "reload clears draft", "copied proof race",
        "stale copy and superseded reconnect", "explicit transfer and lost reply", "fresh tab and lost resume reply"] }));
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
}
