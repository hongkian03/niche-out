const token = location.hash.slice(1);
history.replaceState(null, '', location.pathname);
const status = document.querySelector('#status');
(async () => {
  if (token) {
    const response = await fetch('/api/owner/exchange', { method: 'POST', headers: {'Content-Type':'application/json'}, body:JSON.stringify({token}) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Connection unavailable. Return to local hosting setup.');
    const body = await response.json();
    if (!response.ok) throw new Error(body.code === 'HOST_PLAYER_CONFLICT' ? 'This browser is already a player. Open the host link in a separate browser profile or private window.' : 'Host link expired or was already used. Open a fresh host page from local setup.');
  }
  const response = await fetch('/api/owner/status');
  if (!response.ok) throw new Error('Host access is unavailable. Open a fresh host page from local setup.');
  status.textContent = 'Host authorized. Your hosting session is ready.';
})().catch(error => { status.textContent = error.message; });
