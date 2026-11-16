import assert from "node:assert/strict";
import { launchBrowser } from "../browser.mjs";

export async function browserSmoke(origin, { cookieName = "__Host-niche-probe" } = {}) {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.goto(origin + "/?controlled", { waitUntil: "domcontentloaded" });
    const firstId = await page.evaluate(() => window.probeReady);
    const command = (tab, ...args) => tab.evaluate(args => window.probeCommand(...args), args);
    const first = await command(page);
    assert.equal(first.generation, 1);
    await page.waitForFunction(() => {
      const status = document.querySelector("#connection").textContent;
      return status.includes("websocket") && status.includes("→ ok");
    });
    assert.equal(await page.evaluate(name => document.cookie.includes(name), cookieName), false);
    const cookies = await context.cookies();
    assert(cookies.some(cookie => cookie.name === cookieName &&
      cookie.secure && cookie.httpOnly && cookie.sameSite === "Strict"));
    assert.equal((await command(page, "game.resume", "loaded")).generation, 1);
    await page.locator("#draft").fill("synthetic unsent draft");
    await page.reload();
    assert.notEqual(await page.evaluate(() => window.probeReady), firstId);
    assert.equal(await page.locator("#draft").inputValue(), "");
    assert.equal((await command(page)).generation, 2);
    async function copiedTab() {
      const popup = page.waitForEvent("popup");
      await page.evaluate(() => { window.open(location.href, "_blank"); });
      const copy = await popup;
      await copy.waitForLoadState("domcontentloaded");
      await copy.evaluate(() => window.probeReady);
      return copy;
    }
    const a = await copiedTab();
    const b = await copiedTab();
    const competing = await Promise.all([command(a), command(b)]);
    assert.equal(competing.filter(value => value.generation === 3).length, 1);
    assert.equal(competing.filter(value => value.error === "CONTROL_CONFIRMATION_REQUIRED").length, 1);
    const loser = competing[0].error ? a : b;
    assert.equal((await command(page, "game.resume", "loaded")).error, "TAB_SUPERSEDED");
    await command(loser, "player.claimControl", "bootstrap", false, true);
    assert.equal((await command(loser, "player.claimControl", "bootstrap", true)).generation, 4);
    const independent = await context.newPage();
    await independent.goto(origin + "/?controlled");
    await independent.evaluate(() => window.probeReady);
    await command(independent, "game.resume", "bootstrap", false, true);
    assert.equal((await command(independent, "game.resume", "bootstrap", true)).generation, 5);
    const upload = await page.evaluate(async () => {
      const exact = await fetch("/upload", { method: "POST", body: new Uint8Array(10 * 1024 * 1024) });
      const exactBody = await exact.json();
      const excess = await fetch("/upload", { method: "POST", body: new Uint8Array(10 * 1024 * 1024 + 1) });
      return { exact: exact.status, bytes: exactBody.bytes, excess: excess.status };
    });
    assert.deepEqual(upload, { exact: 200, bytes: 10 * 1024 * 1024, excess: 413 });
    await independent.getByRole("button", { name: "Reconnect transport" }).click();
    await independent.waitForFunction(() => document.querySelector("#connection").textContent.includes("ok"));
    assert.equal((await command(independent, "game.resume", "loaded")).generation, 5);
    // Simulate a provider HTML response after navigation. The client must keep
    // it a transport error and never invent an application outcome.
    await independent.route("**/game.resume", route => route.fulfill({
      status: 502, contentType: "text/html", body: "<h1>Gateway unavailable</h1>"
    }));
    await assert.rejects(command(independent, "game.resume", "loaded"), /non-game response/);
    await independent.unroute("**/game.resume");
    assert.equal((await command(independent, "game.resume", "loaded")).generation, 5);
    const negative = await context.request.post(origin + "/game.resume", {
      headers: { Origin: "https://foreign.example" }, data: {}
    });
    assert.equal(negative.status(), 403);
    const anonymous = await browser.newContext();
    assert.equal((await anonymous.request.post(origin + "/upload", {
      headers: { Origin: origin }, data: "synthetic"
    })).status(), 401);
    console.log(JSON.stringify({ browser: browser.version(), status: "PASS",
      scenarios: ["Secure HttpOnly cookie", "polling/WebSocket acknowledgement", "loaded resume",
        "reload draft clearing", "copied proof race", "explicit claim and lost reply",
        "fresh document lost resume reply", "10 MiB upload and oversized rejection",
        "transport reconnect", "simulated non-JSON provider error", "foreign Origin", "anonymous upload"] }));
  } finally { await browser.close(); }
}
