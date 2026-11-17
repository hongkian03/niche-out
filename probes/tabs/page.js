// Probe page uses native sessionStorage and a fresh server identity on each load.
const status = document.querySelector("output");
const storageKey = "control";
let context;
let sequence = 0;
let last;
async function post(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body) });
  if (!response.ok) throw new Error("Probe request failed: " + response.status);
  return response.json();
}
function input() {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw === null) return { kind: "fresh" };
    try {
      const record = JSON.parse(raw);
      if (!record || !["serverInstanceId","gameId","previousTabId","continuationToken"]
        .every(key => typeof record[key] === "string") ||
        Object.keys(record).length !== 4 || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(record.continuationToken)) {
        return { kind: "ambiguous" };
      }
      return { kind: "continuation", record };
    }
    catch { return { kind: "ambiguous" }; }
  } catch { return { kind: "unavailable" }; }
}
async function initialize() {
  context = await post("/session", { protocolVersion: 2, page: input() });
  return context;
}
async function command(kind = "game.resume", mode = "bootstrap", repeat = false, discardAck = false) {
  const body = repeat ? last : {
    protocolVersion: 2, serverInstanceId: context.serverInstanceId, tabId: context.tabId,
    gameId: context.membership.gameId, requestId: context.requestPrefix + "." + (++sequence),
    payload: kind === "player.claimControl" ? { explicit: true } : { mode }
  };
  last = body;
  const result = await post("/" + kind, body);
  if (discardAck) return;
  if (result.continuation) {
    try { sessionStorage.setItem(storageKey, JSON.stringify(result.continuation)); } catch { /* memory remains live */ }
  }
  status.textContent = result.error ?? "Control generation " + result.controlGeneration;
  return { error: result.error, generation: result.controlGeneration, page: context.tabId };
}
window.probeReady = initialize();
window.probeCommand = command;
document.querySelector("#check").onclick = () => command("game.resume", "loaded");
document.querySelector("#claim").onclick = () => command("player.claimControl");
if (location.hash === "#manual") window.probeReady.then(() => command());
