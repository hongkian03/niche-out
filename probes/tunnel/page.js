const status = document.querySelector("#control");
const connection = document.querySelector("#connection");
const storageKey = "niche-tunnel-control";
let context;
let sequence = 0;
let last;
let socket;
async function post(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body) });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Connection unavailable. The provider returned a non-game response.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.code ?? "Connection unavailable");
  return result;
}
function input() {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw === null) return { kind: "fresh" };
    try {
      const record = JSON.parse(raw);
      if (!record || !["serverInstanceId","gameId","previousTabId","continuationToken"]
        .every(key => typeof record[key] === "string") || Object.keys(record).length !== 4 ||
        !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(record.continuationToken)) return { kind: "ambiguous" };
      return { kind: "continuation", record };
    } catch { return { kind: "ambiguous" }; }
  } catch { return { kind: "unavailable" }; }
}
async function command(kind = "game.resume", mode = "bootstrap", repeat = false, discardAck = false) {
  const body = repeat ? last : {
    protocolVersion: 1, serverInstanceId: context.serverInstanceId, tabId: context.tabId,
    gameId: context.membership.gameId, requestId: context.requestPrefix + "." + (++sequence),
    payload: kind === "player.claimControl" ? { explicit: true } : { mode }
  };
  last = body;
  const result = await post("/" + kind, body);
  if (discardAck) return;
  if (result.continuation) {
    try { sessionStorage.setItem(storageKey, JSON.stringify(result.continuation)); } catch { /* loaded page retains state */ }
  }
  status.textContent = result.error ?? "Control generation " + result.controlGeneration;
  return { error: result.error, generation: result.controlGeneration, page: context.tabId };
}
function connectionFailure(error) {
  const codes = {
    "xhr poll error": "POLLING_ERROR",
    "xhr post error": "POLLING_WRITE_ERROR",
    "websocket error": "WEBSOCKET_ERROR",
    "timeout": "CONNECTION_TIMEOUT"
  };
  const code = Object.hasOwn(codes, error?.message) ? codes[error.message] : "CONNECTION_ERROR";
  const httpStatus = error?.context?.status ?? error?.description;
  const suffix = Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599
    ? ", HTTP " + httpStatus : "";
  return "Connection unavailable (" + code + suffix + "). Check the host terminal.";
}
function acknowledgementStatus(ack, transport) {
  if (ack?.ok === true) return transport + " → ok";
  return ack?.code === "RATE_LIMITED" ? "Acknowledgement declined (RATE_LIMITED)" :
    "Acknowledgement declined (UNEXPECTED_REPLY)";
}
function connect() {
  socket = io({ autoConnect: false, transports: ["polling","websocket"], reconnectionAttempts: 5, reconnectionDelayMax: 5000 });
  socket.on("connect_error", error => { connection.textContent = connectionFailure(error); });
  socket.io.on("reconnect_failed", () => {
    connection.textContent = "Connection unavailable (RECONNECT_EXHAUSTED). Check the host, then use Reconnect transport.";
  });
  socket.on("disconnect", () => { connection.textContent = "Reconnecting…"; });
  socket.on("connect", async () => {
    try {
      const ack = await socket.timeout(5000).emitWithAck("probe");
      connection.textContent = acknowledgementStatus(ack, "Connected via " + socket.io.engine.transport.name);
    } catch { connection.textContent = "Acknowledgement timed out (ACK_TIMEOUT)"; }
  });
  socket.connect();
  socket.io.engine.on("upgrade", async transport => {
    try {
      const ack = await socket.timeout(5000).emitWithAck("probe");
      connection.textContent = acknowledgementStatus(ack, "polling → " + transport.name);
    } catch { connection.textContent = "Acknowledgement timed out (ACK_TIMEOUT)"; }
  });
}
window.probeCommand = command;
window.probeReady = (async () => {
  context = await post("/session", { protocolVersion: 1, page: input() });
  // The test runner uses ?controlled to schedule competing claims itself.
  if (!new URLSearchParams(location.search).has("controlled")) await command();
  connect();
  return context.tabId;
})().catch(error => { status.textContent = error.message; throw error; });
document.querySelector("#check").onclick = () => command("game.resume", "loaded").catch(error => { status.textContent = error.message; });
document.querySelector("#claim").onclick = () => command("player.claimControl").catch(error => { status.textContent = error.message; });
document.querySelector("#reconnect").onclick = () => { socket.disconnect(); socket.connect(); };
document.querySelector("#upload").onclick = async () => {
  try {
    const response = await fetch("/upload", { method: "POST", body: new Uint8Array(1024) });
    const result = await response.json();
    document.querySelector("#uploadResult").textContent = response.ok ? "Upload received: " + result.bytes + " bytes" : result.code;
  } catch { document.querySelector("#uploadResult").textContent = "Upload connection unavailable"; }
};
