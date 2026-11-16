/* Test-only browser adapter; never mounted by the normal launcher. */
const el = id => document.getElementById(id);
const storageKey = 'niche-game-protocol-continuation';
let sequence = 0, gameId = null, controlGeneration = 0, latestView, socket, discovery, firstConnect = true;
let draftRound;
const state = { events: [], acknowledgements: [], disconnected: false };
state.nextRequestId = () => discovery.requestPrefix + "." + (++sequence);
function render(view) {
  if (latestView && view.serverInstanceId === latestView.serverInstanceId && view.gameId === latestView.gameId && view.revision < latestView.revision) return;
  latestView = state.view = view; gameId = view.gameId;
  document.title = 'Niche protocol check — ' + (view.ownPlayer?.nickname || 'Host');
  if (draftRound !== view.roundId) { el('text').value = ''; draftRound = view.roundId; }
  el('phase').textContent = view.phase;
  el('prompt').textContent = view.prompt || '';
  el('view').textContent = JSON.stringify(view, null, 2);
  el('join').hidden = true;
  el('answer').hidden = view.viewRole !== 'player' || view.phase !== 'Answering' || view.ownAnswer?.locked === true;
  el('personal').textContent = view.ownAnswer?.locked ? 'Answer accepted and locked.' : view.ownResult ? JSON.stringify(view.ownResult) : view.phase === 'Finished' ? 'Finished — review your final standings and recap below.' : '';
}
function remember(result) {
  if (result.control) {
    state.superseded = false; el('connection').textContent = 'Connected';
    controlGeneration = result.control.controlGeneration;
    try { sessionStorage.setItem(storageKey, JSON.stringify(result.control.continuation)); } catch {}
    el('claim').hidden = true;
  }
  if (result.gameId) gameId = result.gameId;
  if (result.view) render(result.view);
  if (result.code === 'TAB_SUPERSEDED' || result.code === 'CONTROL_CONFIRMATION_REQUIRED') el('claim').hidden = false;
}
async function sendEnvelope(name, envelope) {
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      result = await new Promise((resolve, reject) => socket.timeout(2000).emit(name, envelope, (error, value) => error ? reject(error) : resolve(value)));
      break;
    } catch (error) { if (attempt === 2) throw error; }
  }
  state.acknowledgements.push({ name, result }); remember(result); return result;
}
async function command(name, payload = {}, extra = {}) {
  if (name === 'player.claimControl' && !socket.connected) {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect(); });
  }
  const envelope = { protocolVersion: 1, serverInstanceId: discovery.serverInstanceId, tabId: discovery.tabId,
    requestId: state.nextRequestId(), gameId, payload, ...extra };
  return sendEnvelope(name, envelope);
}
function notice(error) { el('outcome').textContent = error?.message || String(error); }
window.protocolReady = (async () => {
  let page;
  try { const saved = sessionStorage.getItem(storageKey); page = saved ? { kind: 'continuation', record: JSON.parse(saved) } : { kind: 'fresh' }; }
  catch { page = { kind: 'ambiguous' }; }
  const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ protocolVersion: 1, page }) });
  discovery = await response.json(); if (!response.ok) throw new Error(discovery.code);
  state.discovery = discovery;
  gameId = discovery.membership?.gameId || discovery.hostGameId || null;
  el('join').hidden = discovery.role === 'host' || !!discovery.membership;
  el('code').value = new URL(location.href).searchParams.get('code') || '';
  socket = io({ auth: { protocolVersion: 1, serverInstanceId: discovery.serverInstanceId, tabId: discovery.tabId }, transports: ['polling', 'websocket'] });
  state.socket = socket; state.command = command; state.sendEnvelope = sendEnvelope;
  socket.on('state.snapshot', view => { state.events.push({ kind: 'snapshot', view }); render(view); });
  socket.on('state.changed', view => { state.events.push({ kind: 'changed', view }); render(view); });
  socket.on('player.superseded', () => { state.superseded = true; el('connection').textContent = 'Tab superseded'; el('claim').hidden = false; el('answer').hidden = true; });
  socket.on('game.closed', message => { el('connection').textContent = 'Game closed: ' + message.reason; gameId = null; el('answer').hidden = true; });
  socket.on('disconnect', () => { state.disconnected = true; el('connection').textContent = state.superseded ? 'Tab superseded' : 'Disconnected'; el('text').disabled = true; });
  socket.on('connect', async () => {
    state.disconnected = false; el('connection').textContent = 'Connected'; el('text').disabled = false;
    try {
      if (gameId) await command('game.resume', { mode: firstConnect ? 'bootstrap' : 'loaded' });
      firstConnect = false;
      if (discovery.role === 'host' || gameId) await command('state.get');
    } catch (error) { notice(error); }
  });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return state;
})();
window.protocolReady.catch(notice);
window.protocolState = state;
el('join').onsubmit = async event => { event.preventDefault(); try { const r = await command('game.join', { code: el('code').value, nickname: el('nickname').value }); el('outcome').textContent = r.outcome || r.code; if (!r.code) await command('state.get'); } catch (error) { notice(error); } };
el('answer').onsubmit = async event => { event.preventDefault(); try { const r = await command('answer.submit', { text: el('text').value }, { roundId: latestView.roundId, controlGeneration }); el('outcome').textContent = r.outcome || r.code; if (!r.code && r.locked) { el('text').value = ''; el('text').blur(); el('answer').hidden = true; } } catch (error) { notice(error); } };
el('claim').onclick = async () => { try { const r = await command('player.claimControl', { explicit: true }); el('outcome').textContent = r.outcome || r.code; if (!r.code) await command('state.get'); } catch (error) { notice(error); } };
el('reconnect').onclick = () => { socket.disconnect(); socket.connect(); };
