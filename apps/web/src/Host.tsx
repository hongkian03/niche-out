import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { HostingStatus, Invitation } from '@rarity/contracts';
import type { ClientSnapshot, GameClient } from './client.js';
import { AnswerGroups, Dialog, RoundRecaps, Standings, Timer } from './components.js';
import { hostRevealDurationMs } from './round-reveal.js';
import { filterHostRoster, formatFieldPath, hostHasPlayer, hostPhaseLabel, type HostRoster, type HostView } from './host-helpers.js';

type HostProps = { client: GameClient; state: ClientSnapshot };
type RemovalTarget = { gameId: string; playerId: string; nickname: string };

export function HostConnectionNotice({ client, state }: HostProps) {
  if (state.status === 'host-revoked') return <div className="connection-notice warning" role="alert">
    <strong>Host access is no longer available in this browser.</strong>
    <p>The game keeps running. Use Open host page in the local launcher to restore access. The public join link cannot restore host access.</p>
  </div>;
  if (state.status === 'closed') return <div className="connection-notice warning" role="alert">
    <strong>This hosting session is no longer available.</strong>
    <p>Check the local launcher. If the hosting address changed, start a fresh hosting session and share its new invitation.</p>
  </div>;
  if (state.status === 'connected') return null;
  return <div className="connection-notice warning" role={state.status === 'error' ? 'alert' : 'status'}>
    <strong>{state.status === 'error' ? 'The connection needs attention.' : 'Reconnecting…'}</strong>
    <p>{state.status === 'error' && state.error ? state.error.message : 'Showing the last confirmed view. Host actions are disabled while the current game is synchronized.'}</p>
    <button type="button" className="secondary" onClick={() => void client.retry()}>Retry connection</button>
  </div>;
}

export function HostingNotice({ hosting }: { hosting: HostingStatus }) {
  const label = hosting.status === 'ready' ? 'Hosting ready' : hosting.status === 'starting' ? 'Starting hosting…'
    : hosting.status === 'connecting' ? 'Connecting your tunnel…' : hosting.status === 'reconnecting'
      ? 'Reconnecting hosting… The game keeps running.' : 'Hosting is unavailable. Check the local launcher.';
  return <p className={`hosting-notice hosting-${hosting.status}`} role="status"><span aria-hidden="true">● </span>{label}</p>;
}

function HelpContent() {
  return <div className="help-copy"><p>Find an answer on this game's list. The game maker assigns each answer its tier and points.</p>
    <p>Players may retry answers that are not on the list. The first accepted answer locks for the round.</p>
    <p>Submit before time runs out. A typed answer is never submitted automatically. Tiers and points appear when the round ends.</p>
    <p>Rounds advance automatically. Equal totals share a place, including joint winners.</p></div>;
}

export function HostRosterList({ roster, query, onQuery, onRemove, disabled = false }: {
  roster: HostRoster; query: string; onQuery: (query: string) => void;
  onRemove: (player: HostRoster[number]) => void; disabled?: boolean;
}) {
  const shown = filterHostRoster(roster, query);
  return <div className="host-roster">
    <div className="roster-heading"><h2>Crew</h2><p className="count"><strong>{roster.length}</strong> / 100 admitted</p></div>
    <label className="field">Search players<input type="search" value={query} onChange={event => onQuery(event.currentTarget.value)} placeholder="Nickname" autoComplete="off" /></label>
    {query && <div className="search-feedback"><span>{shown.length} {shown.length === 1 ? 'match' : 'matches'}</span><button type="button" className="quiet" onClick={() => onQuery('')}>Clear search</button></div>}
    <div className="roster-scroll" role="region" aria-label="Admitted players" tabIndex={0}>
      {roster.length === 0 ? <p className="empty-state">No players yet. Share the invitation to assemble your crew.</p>
        : shown.length === 0 ? <p className="empty-state">No players match this search.</p>
          : <ul className="roster-list">{shown.map(player => <li key={player.playerId} data-player-id={player.playerId}>
            <div className="roster-identity"><strong>{player.nickname}</strong><span className={`connection-label ${player.connection}`}>{player.connection === 'connected' ? 'Connected' : 'Disconnected · place kept'}</span></div>
            <button type="button" className="quiet danger" disabled={disabled} aria-label={`Remove ${player.nickname}`} onClick={() => onRemove(player)}>Remove</button>
          </li>)}</ul>}
    </div>
    {roster.length === 100 && <p className="notice">This game is full. Existing players can still reconnect.</p>}
  </div>;
}

function useQr(payload: string) {
  const [result, setResult] = useState<{ payload: string; url: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(payload, { width: 640, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then(url => { if (active) setResult({ payload, url }); }, () => { if (active) setResult({ payload, url: null }); });
    return () => { active = false; };
  }, [payload]);
  return result?.payload === payload ? result : null;
}

export function HostInvitation({ invitation, ready }: { invitation: Invitation; ready: boolean }) {
  const [enlarged, setEnlarged] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle');
  const qr = useQr(invitation.qrPayload);
  useEffect(() => { setEnlarged(false); setCopy('idle'); }, [invitation.qrPayload]);
  useEffect(() => { if (!ready) setEnlarged(false); }, [ready]);
  async function copyLink() {
    try { await navigator.clipboard.writeText(invitation.qrPayload); setCopy('copied'); }
    catch { setCopy('manual'); }
  }
  const qrImage = qr?.url ? <img className="qr-code" src={qr.url} alt={`Scan to join game ${invitation.code}`} width={256} height={256} />
    : <p className="qr-placeholder">{qr ? 'QR unavailable. Use the join link below.' : 'Preparing QR…'}</p>;
  return <section className="invitation-card" aria-label="Game invitation">
    <p className="eyebrow">Game code</p><p className="game-code"><span aria-hidden="true">{invitation.code}</span><span className="sr-only">Game code {invitation.code.split('').join(' ')}</span></p>
    {ready ? <><div className="invitation-qr">{qrImage}</div>
      <p>Open this link or scan the QR code. Internet required.</p><p className="muted">Players can use Wi-Fi or mobile data; they do not need the same network.</p>
      <a className="join-link" href={invitation.qrPayload}>{invitation.qrPayload}</a>
      <div className="actions"><button type="button" className="secondary" onClick={() => void copyLink()}>Copy join link</button>
        <button type="button" className="secondary" disabled={!qr?.url} onClick={() => setEnlarged(true)}>Enlarge QR</button></div>
      <p className="feedback" role="status">{copy === 'copied' ? 'Copied' : copy === 'manual' ? 'Select the complete link below and copy it manually.' : ''}</p>
      {copy === 'manual' && <label className="field">Join link<input readOnly value={invitation.qrPayload} onFocus={event => event.currentTarget.select()} /></label>}
    </> : <p className="notice">The invitation will be available when hosting is ready.</p>}
    {enlarged && ready && <Dialog open title="Scan to join" onClose={() => setEnlarged(false)}>
      <div className="qr-enlarged">{qrImage}<p className="game-code">{invitation.code}</p><p className="join-link">{invitation.qrPayload}</p><p>Internet required. Wi-Fi or mobile data both work.</p></div>
    </Dialog>}
  </section>;
}

export function HostPackSummary({ candidate, replacing }: { candidate: NonNullable<ClientSnapshot['candidate']>; replacing: boolean }) {
  const { summary } = candidate;
  return <section className="pack-summary" aria-label="Validated game summary"><h2>{summary.title}</h2>
    <p>{summary.promptCount} {summary.promptCount === 1 ? 'prompt' : 'prompts'} · {summary.tiers.length} {summary.tiers.length === 1 ? 'tier' : 'tiers'}</p>
    <dl className="timer-settings"><div><dt>Read</dt><dd>{summary.settings.readingSeconds} seconds</dd></div><div><dt>Answer</dt><dd>{summary.settings.answerSeconds} seconds</dd></div><div><dt>Results</dt><dd>{summary.settings.resultsSeconds} seconds</dd></div></dl>
    <div className="tier-catalogue" role="region" aria-label="Game tiers" tabIndex={0}><ul>{summary.tiers.map((tier, index) => <li key={index}><span>{tier.name}</span><strong>{tier.points} points</strong></li>)}</ul></div>
    {replacing && <p className="notice warning">Replacing this game creates a new code. Everyone must rejoin, and previous results will be cleared.</p>}
  </section>;
}

function HostUpload({ client, state, view, onBack }: HostProps & { view: HostView; onBack?: () => void }) {
  const [filename, setFilename] = useState('');
  const [dragging, setDragging] = useState(false);
  const busy = state.pending !== null;
  const usable = state.status === 'connected';
  const replacing = view.gameId !== null;
  const UploadHeading = replacing ? 'h2' : 'h1';
  const expired = state.error?.code === 'CANDIDATE_EXPIRED' || state.error?.code === 'CANDIDATE_STALE';
  const canCommit = !busy && usable && !expired && view.hosting.status === 'ready' &&
    (view.phase === 'Setup' || view.phase === 'Finished' || (view.phase === 'Lobby' && view.canReplace));
  function choose(file?: File) {
    if (!file || busy || !usable) return;
    setFilename(file.name); void client.upload(file);
  }
  return <section className="panel upload-panel" aria-labelledby={replacing ? 'upload-heading' : 'phase-heading'}>
    <p className="eyebrow">Game file</p><UploadHeading className="upload-title" id={replacing ? 'upload-heading' : 'phase-heading'} data-phase-heading={!replacing || undefined} tabIndex={-1}>{replacing ? 'Prepare a new game' : 'Bring your own expedition'}</UploadHeading>
    <p>Upload your prompts, accepted answers and scoring tiers as a JSON file.</p>
    <div className={`file-drop ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files[0]); }}>
      <label className="field" htmlFor="game-file">Choose JSON file</label><input id="game-file" type="file" accept=".json,application/json" disabled={busy || !usable} onChange={event => { choose(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} />
      <p className="muted">Or drop a file here · 10 MiB maximum · 1–20 prompts</p>
    </div>
    {filename && <p className="filename">File: {filename}</p>}
    <div className="format-help"><a href="/game.example.json" download>Download example JSON</a><details><summary>File format help</summary>
      <p>Use the example's versioned structure. Define each answer's canonical text, explicit spelling aliases and scoring tier. Unknown fields are rejected.</p>
      <p>Game titles: up to 256 characters. Prompts: 4,096. Answers and aliases: 512. Use nonnegative whole-number points. Matching ignores case and extra spaces; it does not guess spelling.</p>
      <p>Use one set of read, answer and results durations for the game (0.1–600 seconds each). Omitted durations use 3, 25 and 10 seconds. Prompts run in file order.</p>
      <a href="/game-format.txt" target="_blank" rel="noreferrer">Open the complete format guide</a>
    </details></div>
    {state.pending?.kind === 'upload' && <p role="status">Checking game file…</p>}
    {state.error && <div className="notice error" role="alert"><p>{state.error.message}</p>{state.error.fieldErrors?.length ? <ul>{state.error.fieldErrors.map((error, index) => <li key={index}><code>{formatFieldPath(error.path)}</code>: {error.message}</li>)}</ul> : null}
      {expired && <p>Choose the file again to validate it before creating the game.</p>}</div>}
    {state.candidate && <><HostPackSummary candidate={state.candidate} replacing={replacing} />
      <button type="button" className="primary" disabled={!canCommit} onClick={() => void client.commit()}>{state.pending?.kind === 'commit' ? state.pending.label : replacing ? 'Replace game' : 'Create lobby'}</button>
      {view.hosting.status !== 'ready' && <p className="notice">Wait for hosting to be ready before creating the lobby.</p>}</>}
    {onBack && <button type="button" className="secondary" disabled={busy} onClick={onBack}>Back to {view.phase === 'Finished' ? 'results' : 'current lobby'}</button>}
  </section>;
}

export function Host({ client, state, revealActive = false }: HostProps & { revealActive?: boolean }) {
  const view = state.view?.viewRole === 'host' ? state.view : null;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<RemovalTarget | null>(null);
  const [notice, setNotice] = useState('');
  const previousGame = useRef(view?.gameId);
  const busy = state.pending !== null;
  const disabled = busy || state.status !== 'connected';

  useEffect(() => {
    if (!view) return;
    if (previousGame.current !== view.gameId) {
      previousGame.current = view.gameId; setQuery(''); setUploadOpen(false); setManageOpen(false); setHelpOpen(false);
    }
    if (view.phase !== 'Setup' && view.phase !== 'Lobby' && view.phase !== 'Finished') { setUploadOpen(false); setHelpOpen(false); }
    if (target && (target.gameId !== view.gameId || !hostHasPlayer(view, target.playerId))) {
      setNotice(target.gameId !== view.gameId ? 'The game changed. The removal confirmation has closed.' : `${target.nickname} is no longer in this game.`);
      setTarget(null);
    }
  }, [view, target]);

  if (!view) return null;
  const timed = view.phase === 'Reading' || view.phase === 'Answering' || view.phase === 'Results';
  const setup = view.phase === 'Setup';
  const openUpload = () => {
    setUploadOpen(true); client.clearError();
    requestAnimationFrame(() => document.getElementById('upload-heading')?.focus());
  };
  const back = () => {
    client.discardCandidate(); setUploadOpen(false);
    requestAnimationFrame(() => document.getElementById('phase-heading')?.focus());
  };
  const remove = (player: HostRoster[number]) => { if (view.gameId) { setTarget({ ...player, gameId: view.gameId }); client.clearError(); } };
  const phaseTimer = timed ? <Timer deadlineMs={view.phaseDeadlineMs} clockOffsetMs={state.clockOffsetMs} phaseId={view.phaseId} label={view.phase === 'Reading' ? 'Answers open in' : view.phase === 'Answering' ? 'Time remaining' : view.roundIndex === view.promptCount - 1 ? 'Final results in' : 'Next round in'} /> : null;

  return <main className={`host-shell phase-${view.phase.toLowerCase()}`}>
    <HostConnectionNotice client={client} state={state} />
    <header className="host-toolbar"><div><p className="eyebrow">Host console</p><HostingNotice hosting={view.hosting} /></div><div className="actions">
      {(setup || view.phase === 'Lobby') && <button type="button" className="quiet" onClick={() => setHelpOpen(true)}>How to play</button>}
      {timed && <button type="button" className="secondary" onClick={() => setManageOpen(true)}>Manage players</button>}
    </div></header>
    <p className="sr-only" role="status">{notice}</p>
    {state.pending && state.pending.kind !== 'upload' && <p className="notice pending" role="status">{state.pending.label}</p>}
    {state.error && state.status === 'connected' && !setup && !uploadOpen && !target && <div className="notice error" role="alert"><p>{state.error.message}</p><button type="button" className="quiet" onClick={() => client.clearError()}>Dismiss message</button></div>}
    {(setup || uploadOpen) && <HostUpload client={client} state={state} view={view} {...(!setup ? { onBack: back } : {})} />}

    {view.phase === 'Lobby' && <><header className="stage-heading"><p className="eyebrow">Assemble your crew</p><h1 id="phase-heading" data-phase-heading tabIndex={-1}>{view.packSummary.title}</h1><p>{view.promptCount} {view.promptCount === 1 ? 'round' : 'rounds'} · Each accepted answer locks for the round</p></header>
      <div className="host-grid lobby-grid"><section className="panel invite-panel"><HostInvitation invitation={view.invitation} ready={view.hosting.status === 'ready'} />
        <div className="start-controls"><button type="button" className="primary" disabled={!view.canStart || disabled} onClick={() => void client.start()}>{state.pending?.kind === 'start' ? state.pending.label : 'Start game'}</button>
          <p>Starting closes entry to new players.</p>{view.roster.length === 0 && <p className="muted">At least one player must join to start.</p>}
          {view.hosting.status !== 'ready' && <p className="notice">Hosting must be ready before starting.</p>}</div>
      </section><section className="panel roster-panel"><HostRosterList roster={view.roster} query={query} onQuery={setQuery} onRemove={remove} disabled={disabled} />
        {view.admissionHistoryFull && <p className="notice warning">This lobby has reached its admission history limit. Create a fresh lobby for new players; existing players may reconnect.</p>}
        {!uploadOpen && <button type="button" className="secondary" disabled={disabled || !view.canReplace} onClick={openUpload}>Choose another game file</button>}
      </section></div></>}

    {timed && <div className="host-stage"><div className="phase-strip"><div><p className="eyebrow">Round {view.roundIndex + 1} of {view.promptCount}</p><h1 id="phase-heading" data-phase-heading tabIndex={-1}>{hostPhaseLabel(view)}</h1></div>{phaseTimer}</div>
      <progress className="round-progress" value={view.roundIndex} max={view.promptCount} aria-label={`${view.roundIndex} of ${view.promptCount} rounds completed`} />
      <section className="panel prompt-panel">
        {revealActive && view.phase === 'Results' && <svg className="host-sonar-pulse" viewBox="0 0 1000 18" preserveAspectRatio="none"
          aria-hidden="true" focusable="false" style={{ animationDuration: `${hostRevealDurationMs}ms` }}>
          <path d="M0 9h403l19-2 12 4 14-2h20l10-5 8 10 8-13 10 16 10-14 9 11 8-7 10 2h20l10-3 10 5 12-2h405" />
        </svg>}
        <div className="prompt-scroll" role="region" aria-label="Current prompt" tabIndex={0}><h2 className="prompt-text">{view.prompt}</h2></div>
      </section>
      {(view.phase === 'Reading' || view.phase === 'Answering') && <div className="host-readiness"><p className="readiness-count"><strong>{view.readiness.accepted}</strong> of {view.readiness.eligible} answers locked</p>
        {view.readiness.eligible === 0 ? <p>No players remaining. The scheduled game continues.</p> : <p className="muted">{view.phase === 'Reading' ? 'Give your crew a moment to read.' : 'Players answer on their own devices.'}</p>}
      </div>}
      {view.phase === 'Results' && <div className="host-grid results-grid"><section className="panel"><h2>Answers from the crew</h2><AnswerGroups results={view.results} /></section><section className="panel"><h2>Standings</h2><Standings rows={view.standings} limit={10} /></section></div>}
    </div>}

    {view.phase === 'Finished' && <div className="host-final"><header className="stage-heading"><p className="eyebrow">Expedition complete</p><h1 id="phase-heading" data-phase-heading tabIndex={-1}>{view.standings.length ? (view.winnerIds.length > 1 ? 'Joint winners' : 'Our winner') : 'No players remaining'}</h1>
      {view.standings.length > 0 && <ul className="winners">{view.standings.filter(row => view.winnerIds.includes(row.playerId)).map(row => <li key={row.playerId}><strong>{row.nickname}</strong><span>{row.publishedTotal} points</span></li>)}</ul>}
      <p>Results stay here while hosting runs, until a new game replaces them.</p>{!uploadOpen && <button type="button" className="primary" disabled={disabled} onClick={openUpload}>Create new game</button>}
    </header><div className="host-grid final-grid"><section className="panel"><h2>Final standings</h2><Standings rows={view.standings} /></section><section className="panel"><h2>Round recap</h2><RoundRecaps rounds={view.rounds} cache={state.recapCache} onRequest={roundId => void client.recap(roundId)} /></section></div></div>}

    {helpOpen && <Dialog open title="How to play" onClose={() => setHelpOpen(false)}><HelpContent /></Dialog>}
    {manageOpen && <Dialog open title="Manage players" onClose={() => { setManageOpen(false); setQuery(''); }}>
      <div className="management-phase"><p>{hostPhaseLabel(view)}</p>{phaseTimer}<p className="muted">The game keeps running while this panel is open.</p></div>
      {state.pending && <p className="notice pending" role="status">{state.pending.label} Closing this panel does not cancel the request.</p>}
      {state.error && <p className="notice error" role="alert">{state.error.message}</p>}
      {'roster' in view ? <HostRosterList roster={view.roster} query={query} onQuery={setQuery} onRemove={remove} disabled={disabled} /> : <p>The game has finished. Review the final standings and round recap.</p>}
    </Dialog>}
    {target && <Dialog open title={`Remove ${target.nickname} from this game?`} onClose={() => setTarget(null)}>
      <p>This player will leave play and the leaderboard. Their accepted answers stay in the statistics, and this identity cannot reconnect.</p>
      {timed && <p>The timer keeps running.</p>}{state.pending?.kind === 'remove' && <p role="status">{state.pending.label} Closing this dialog does not cancel the request.</p>}
      {state.error && <p className="notice error" role="alert">{state.error.message}</p>}
      <div className="actions"><button type="button" className="secondary" data-initial-focus onClick={() => setTarget(null)}>{state.pending?.kind === 'remove' ? 'Close' : 'Cancel'}</button><button type="button" className="danger primary" disabled={disabled || target.gameId !== view.gameId || !hostHasPlayer(view, target.playerId)} onClick={() => void client.remove(target.playerId)}>{state.pending?.kind === 'remove' ? 'Removing…' : 'Remove player'}</button></div>
    </Dialog>}
  </main>;
}
