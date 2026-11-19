const $ = id => document.getElementById(id);
const setText = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
let current, pending = false, stopped = false, selectedAction, refreshSequence = 0;
async function request(path, body) {
  const response = await fetch('/control/' + path, body === undefined ? {} : {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The local launcher is unavailable.');
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.code === 'LOCAL_ACCESS_REQUIRED' || result.code === 'INVALID_LOCAL_ACCESS' ? 'Open setup again from the launcher terminal by pressing Enter.' : result.code === 'SESSION_CHANGED' ? 'The session changed. Review its current state and try again.' : result.code || 'Request failed'), {code: result.code});
  return result;
}
function failureDetail(code) {
  if (typeof code === 'string' && (['connector-cache','connector-download','connector-version','connector-prepare-failed'].includes(code))) return 'The tunnel component could not be prepared. Check internet access, your download proxy/certificate configuration and permission to use the local cache. Retry hosting or run the installed CLI prepare command. No unverified component was started.';
  if (code === 'connector-missing' || code === 'connector-integrity') return 'The tunnel connector is missing or failed verification. For an npm installation, retry preparation with the installed CLI. Contributors can run npm run setup:tunnel in the project folder. Then start a new hosting session.';
  if (code === 'unsupported-platform') return 'This system has no supported connector package. Use a supported macOS, Windows x64 or Linux x64 package.';
  if (code === 'startup-timeout' || code === 'endpoint-lost') return 'The public connection could not be reached. Check internet access and whether this network permits the tunnel connection. A new hosting session will create a new link and clear previous session state.';
  return 'This endpoint is unavailable. Check the launcher and network, then start a new hosting session. Previous session state will be cleared and players will need a new link.';
}
function render(value) {
  const prior = current; current = value;
  setText('status', ({idle:'Ready to host',preparing:'Preparing your tunnel component…',starting:'Starting your server…',connecting:'Connecting your tunnel…',ready:'Your session is ready',reconnecting:'Reconnecting…',failed:'Hosting unavailable',stopping:'Finishing hosting…'})[value.state] || value.state);
  $('detail').textContent = value.state === 'preparing' ? ({checking:'Checking the cached tunnel component…',waiting:'Waiting for another preparation to finish…',downloading:'Downloading the verified tunnel component…',verifying:'Verifying the tunnel component…'}[value.preparation?.stage] || 'Preparing the tunnel component. You can cancel this setup.') : value.state === 'failed' ? failureDetail(value.error) : value.state === 'connecting' ? 'Checking the public connection. A new address can take a few minutes to become reachable.' : value.state === 'ready' ? 'Share your public link below. Keep this computer and launcher running.' : value.state === 'reconnecting' ? 'The existing session is preserved while its connection recovers.' : 'Internet access is required. The address lasts for this hosting session.';
  $('indicator').dataset.ready = String(value.state === 'ready');
  $('start').hidden = !['idle','failed'].includes(value.state); $('start').textContent = value.state === 'failed' ? 'Start new hosting session' : 'Start hosting'; $('start').disabled = pending;
  $('finish').hidden = value.state === 'idle'; $('finish').textContent = ['preparing','starting','connecting'].includes(value.state) ? 'Cancel startup' : 'Finish hosting'; $('finish').disabled = pending || value.state === 'stopping';
  $('quit').disabled = pending; $('sharing').hidden = value.state !== 'ready';
  if (value.state === 'ready') {
    $('url').value = value.publicOrigin;
    if (prior?.publicOrigin !== value.publicOrigin || prior?.state !== 'ready') { const qr = '/control/qr?v=' + encodeURIComponent(value.sessionId); $('qr').src = qr; $('largeQr').src = qr; }
  } else { $('url').value = ''; $('privateFallback').hidden = true; $('privateFallback').removeAttribute('href'); if ($('qrDialog').open) $('qrDialog').close(); }
  if (prior && prior.sessionId !== value.sessionId && $('confirm').open) { $('confirm').close(); selectedAction = undefined; }
}
async function refresh() { const sequence = ++refreshSequence; const value = await request('state'); if (sequence === refreshSequence && !stopped) render(value); return value; }
async function perform(action, confirm = false) {
  if (pending) return;
  const captured = current?.sessionId ?? null; ++refreshSequence; pending = true; $('error').textContent = ''; if (current) render(current);
  try {
    if (action === 'start' && current.state === 'failed') await request('finish',{sessionId:captured,confirm});
    await request(action, action === 'start' ? {} : {sessionId:captured,confirm});
    if (action === 'quit') { stopped = true; $('status').textContent = 'Launcher closed'; $('detail').textContent = 'You can close this tab.'; $('sharing').hidden = true; return; }
    await refresh();
  } catch (error) {
    if (error.code === 'CONFIRM_STATE_LOSS' && !confirm) {
      try {
        const latest = await refresh();
        if (latest.sessionId === captured && current?.sessionId === captured) {
          openConfirmation(action);
        } else {
          $('error').textContent = 'The session changed. Review its current state and try again.';
        }
      } catch (refreshError) { $('error').textContent = refreshError.message; }
    } else { $('error').textContent = error.message; }
  }
  finally { pending = false; if (!stopped && current) render(current); }
}
function openConfirmation(action) {
  selectedAction = action;
  $('confirmTitle').textContent = action === 'quit' ? 'Quit this launcher?' : action === 'start' ? 'Start a fresh hosting session?' : 'Finish this hosting session?';
  $('confirmAction').textContent = action === 'quit' ? 'Quit launcher' : action === 'start' ? 'Start fresh session' : 'Finish hosting';
  if (!$('confirm').open) $('confirm').showModal();
}
function deliberate(action) {
  if (pending || !current) return;
  if (current.hasDisposableState && (action !== 'start' || current.state === 'failed')) {
    openConfirmation(action);
  } else void perform(action);
}
$('start').onclick = () => deliberate('start'); $('finish').onclick = () => deliberate('finish'); $('quit').onclick = () => deliberate('quit');
$('cancelConfirm').onclick = () => {$('confirm').close(); selectedAction = undefined;};
$('confirmAction').onclick = () => {const action = selectedAction; $('confirm').close(); selectedAction = undefined; if(action) void perform(action,true);};
$('copy').onclick = async () => { try {await navigator.clipboard.writeText($('url').value); $('copyStatus').textContent='Link copied.';} catch {$('url').focus();$('url').select();$('copyStatus').textContent='Select and copy the link above.';} };
$('enlarge').onclick = () => $('qrDialog').showModal();
$('owner').onclick = async () => {
  const popup = window.open('about:blank','_blank'); if(popup) popup.opener = null;
  $('privateFallback').hidden = true; $('privateFallback').removeAttribute('href');
  try {const result = await request('owner-link',{sessionId:current.sessionId}); if(popup) popup.location.replace(result.url); else {$('privateFallback').href=result.url;$('privateFallback').hidden=false;}}
  catch(error){popup?.close();$('error').textContent=error.message;}
};
(async () => {
  const token = new URLSearchParams(location.hash.slice(1)).get('access'); history.replaceState(null,'',location.pathname);
  try { if(token) await request('exchange',{token}); await refresh(); }
  catch(error){$('error').textContent=error.message;return;}
  async function poll(){if(stopped)return;try{await refresh();}catch(error){$('error').textContent=error.message;}if(!stopped)setTimeout(poll,1000);}
  setTimeout(poll,1000);
})();
