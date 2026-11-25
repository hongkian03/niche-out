import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { codePointCount, trimOuterWhitespace } from '@rarity/contracts';
import type { ClientSnapshot, GameClient } from './client.js';
import { AnswerGroups, Dialog, Standings, Timer } from './components.js';
import {
  estimatedRemainingMs, initialInvitationCode, playerErrorMessage, validateAnswer, validateJoin,
  type PersonalResult, type PlayerView,
} from './player-helpers.js';

export type PlayerProps = { client: GameClient; state: ClientSnapshot };

function HowToPlay({ close }: { close: () => void }) {
  return <Dialog open title="How to play" onClose={close}>
    <p>Find an answer on the game maker’s list. Answers have custom tiers and points set by the game maker; answer counts do not change those points.</p>
    <ol>
      <li>Read the prompt, then type an answer when answering opens.</li>
      <li>Press Submit before time runs out. Typed text is never submitted automatically.</li>
      <li>An answer outside the list can be edited and tried again. Only listed spellings and aliases are accepted, ignoring case and extra spaces.</li>
      <li>Your first accepted answer is locked. Its tier and points stay hidden until the round ends.</li>
      <li>Rounds advance automatically. Equal totals share a place, including joint winners.</li>
    </ol>
    <p>Keep this page open and stay connected to the internet. Refreshing clears an unsubmitted draft.</p>
    <button type="button" onClick={close}>Got it</button>
  </Dialog>;
}

function ConnectionNotice({ client, state }: PlayerProps) {
  if (state.status === 'superseded') return <div className="connection-notice warning" role="status">
    <strong>This game is active in another tab.</strong>
    <p>Your nickname, score, and accepted answers are preserved. Confirm control to continue here.</p>
    <button type="button" onClick={() => void client.claimControl()} disabled={state.pending !== null}>
      {state.pending?.kind === 'claim' ? state.pending.label : 'Take control here'}
    </button>
    {state.error && <p>{playerErrorMessage(state.error)}</p>}
  </div>;
  if (state.status === 'reconnecting' || state.status === 'connecting' || state.status === 'discovering') {
    return <div className="connection-notice warning" role="status">
      <strong>Reconnecting…</strong>
      <p>This view is awaiting synchronization. The game keeps running; editing and submission are paused.</p>
    </div>;
  }
  if (state.status === 'error') return <div className="connection-notice warning" role="alert">
    <strong>Connection needs attention</strong>
    <p>{playerErrorMessage(state.error) ?? 'The current game could not be confirmed. Check your internet connection and try again.'}</p>
    <button type="button" onClick={() => void client.retry()} disabled={state.pending !== null}>Retry connection</button>
  </div>;
  return null;
}

function Terminal({ state }: { state: ClientSnapshot }) {
  const removed = state.status === 'removed';
  return <section className="panel player-terminal" aria-labelledby="terminal-heading">
    <p className="eyebrow">Session ended</p>
    <h1 id="terminal-heading" data-phase-heading tabIndex={-1}>{removed ? 'You were removed from this game.' : 'This game is no longer available.'}</h1>
    <p>{removed ? 'Your player identity cannot reconnect to this game. Ask the host if you need help.'
      : 'The game was replaced, the server restarted, or its address changed. Ask the host for a fresh invitation.'}</p>
    {state.error && <p role="status">{playerErrorMessage(state.error)}</p>}
    {!removed && <a className="button secondary" href="/join">Back to join</a>}
  </section>;
}

function Join({ client, state, showHelp }: PlayerProps & { showHelp: () => void }) {
  const [code, setCode] = useState(() => initialInvitationCode(typeof location === 'undefined' ? '' : location.search));
  const [nickname, setNickname] = useState('');
  const [errors, setErrors] = useState<{ code?: string; nickname?: string }>({});
  const busy = state.pending !== null || state.status !== 'connected';
  const serverError = playerErrorMessage(state.error);
  const nicknameError = errors.nickname ?? (state.error?.code === 'NICKNAME_TAKEN' ? serverError : null);
  const codeError = errors.code ?? (['GAME_NOT_FOUND', 'NO_LOBBY', 'ENTRY_CLOSED', 'GAME_FINISHED', 'GAME_FULL', 'ADMISSION_HISTORY_LIMIT'].includes(state.error?.code ?? '') ? serverError : null);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next = validateJoin(code, nickname);
    setErrors(next);
    if (Object.keys(next).length === 0) void client.join(trimOuterWhitespace(code), nickname);
  }
  return <section className="panel join-panel" aria-labelledby="join-heading">
    <p className="eyebrow">Your next deep cut awaits</p>
    <h1 id="join-heading" data-phase-heading tabIndex={-1}>Join a game</h1>
    <p>Enter the host’s code and choose your nickname. Internet is required, using Wi-Fi or mobile data.</p>
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="game-code">Game code</label>
        <input id="game-code" name="code" type="text" inputMode="numeric" autoComplete="off" placeholder="000000"
          value={code} disabled={busy} aria-invalid={!!codeError} aria-describedby={codeError ? 'code-error' : 'code-help'}
          onChange={(event) => { setCode(event.target.value); setErrors((old) => ({ ...old, code: undefined })); }} />
        <p id="code-help" className="hint">Six digits, including any leading zeroes.</p>
        {codeError && <p id="code-error" className="field-error" role="alert">{codeError}</p>}
      </div>
      <div className="field">
        <label htmlFor="nickname">Nickname</label>
        <input id="nickname" name="nickname" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false}
          value={nickname} disabled={busy} aria-invalid={!!nicknameError} aria-describedby={nicknameError ? 'nickname-error nickname-help' : 'nickname-help'}
          onChange={(event) => { setNickname(event.target.value); setErrors((old) => ({ ...old, nickname: undefined })); }} />
        <p id="nickname-help" className="hint">Up to 32 characters. Your nickname stays fixed for this game.</p>
        {nicknameError && <p id="nickname-error" className="field-error" role="alert">{nicknameError}</p>}
      </div>
      {serverError && !nicknameError && !codeError && <p className="field-error" role="alert">{serverError}</p>}
      <button type="submit" disabled={busy}>{state.pending?.kind === 'join' ? state.pending.label : 'Join game'}</button>
    </form>
    <button type="button" className="secondary" onClick={showHelp}>How to play</button>
  </section>;
}

function Lobby({ view, showHelp }: { view: Extract<PlayerView, { phase: 'Lobby' }>; showHelp: () => void }) {
  return <section className="panel player-lobby" aria-labelledby="lobby-heading">
    <p className="eyebrow">You’re aboard</p>
    <h1 id="lobby-heading" data-phase-heading tabIndex={-1}>{view.title}</h1>
    <p className="player-identity">Playing as <strong>{view.ownPlayer.nickname}</strong></p>
    <div className="lobby-beacon" aria-hidden="true">◈</div>
    <h2>Waiting for the host to start</h2>
    <p role="status">{view.admittedCount} of 100 players admitted</p>
    <p className="hint">The first prompt appears automatically when the host starts.</p>
    <button type="button" className="secondary" onClick={showHelp}>How to play</button>
  </section>;
}

function PersonalOutcome({ result, compact = false }: { result: PersonalResult; compact?: boolean }) {
  return <div className={`personal-outcome ${result.outcome === 'accepted' ? 'accepted' : 'miss'} ${compact ? 'compact' : ''}`}>
    <p className="points">+{result.points}<span className="sr-only"> points</span></p>
    {result.outcome === 'accepted' ? <div className="result-wording" role={!compact ? 'region' : undefined} aria-label={!compact ? 'Your accepted answer details' : undefined} tabIndex={!compact ? 0 : undefined}>
      <p className="answer-canonical">{result.canonicalText}</p>
      <p className="tier-label">{result.tierName}</p>
      {result.submittedText !== result.canonicalText && <p className="hint">You submitted: {result.submittedText}</p>}
      {result.points === 0 && <p className="hint">Accepted answer · 0 points</p>}
    </div> : <p>No accepted answer</p>}
  </div>;
}

function LiveRound({ client, state, view }: PlayerProps & { view: Extract<PlayerView, { phase: 'Reading' | 'Answering' }> }) {
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const field = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const feedback = state.answerFeedback?.roundId === view.roundId ? state.answerFeedback : null;
  const accepted = view.ownAnswer.locked || feedback?.status === 'accepted';
  const checking = feedback?.status === 'checking' || feedback?.status === 'confirming';
  const remaining = estimatedRemainingMs(view.phaseDeadlineMs, state.clockOffsetMs, now);
  const connected = state.status === 'connected';
  const canEdit = view.phase === 'Answering' && connected && !accepted && !checking && state.pending === null && remaining > 0;
  const submittedText = view.ownAnswer.locked ? view.ownAnswer.submittedText : feedback?.submittedText ?? draft;
  const visibleText = accepted || checking ? submittedText : draft;
  const lengthError = codePointCount(draft) > 512 ? validateAnswer(draft) : null;
  const rejection = feedback?.status === 'rejected' ? feedback.message ?? 'Not on this game’s answer list. Try again.' : null;
  const error = localError ?? lengthError ?? rejection;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (view.phase === 'Answering' && connected && !accepted &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
      !document.querySelector('dialog[open], [role="dialog"]') &&
      (document.activeElement === document.body || document.activeElement?.hasAttribute('data-phase-heading'))) {
      field.current?.focus({ preventScroll: true });
    }
    // Only opening the phase can auto-focus. Readiness updates/reconnection cannot steal focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase]);
  useEffect(() => {
    if (accepted || view.phase !== 'Answering' || remaining === 0) field.current?.blur();
  }, [accepted, view.phase, remaining === 0]);
  useEffect(() => {
    if (feedback?.status === 'rejected' && canEdit) field.current?.focus({ preventScroll: true });
  }, [feedback?.status]);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canEdit || composing.current) return;
    const problem = validateAnswer(draft);
    setLocalError(problem);
    if (problem) { field.current?.focus({ preventScroll: true }); return; }
    void client.submit(draft);
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
  }
  const phaseLabel = view.phase === 'Reading' ? 'Read the prompt' : accepted ? 'Answer locked' : remaining === 0 ? 'Closing round…' : 'Prompt:';
  return <section className="live-round" aria-labelledby="phase-heading">
    <div className="status-strip">
      <span>Round {view.roundIndex + 1} of {view.promptCount}</span>
      <span>{view.publishedTotal} points</span>
      <progress value={view.roundIndex} max={view.promptCount} aria-label={`${view.roundIndex} of ${view.promptCount} rounds completed`} />
    </div>
    <div className="panel prompt-panel">
      <p id="phase-heading" data-phase-heading tabIndex={-1} className="eyebrow" aria-live="polite">{phaseLabel}</p>
      <div className="prompt-scroll" role="region" aria-label="Current prompt" tabIndex={0}>
        <h1>{view.prompt}</h1>
      </div>
    </div>
    <div className="panel composer">
      <Timer deadlineMs={view.phaseDeadlineMs} clockOffsetMs={state.clockOffsetMs} phaseId={view.phaseId} label={view.phase === 'Reading' ? 'Answering opens in' : 'Time remaining'} />
      {view.phase === 'Answering' && <p className="readiness">{view.readiness.accepted} of {view.readiness.eligible} answers submitted</p>}
      <form onSubmit={submit} noValidate>
        <div className="field">
          {accepted ? <span>Your answer</span> : <label htmlFor="answer">Your answer</label>}
          {accepted && <p className="locked-answer">{submittedText}</p>}
          <input ref={field} id="answer" name="answer" value={visibleText} type="text" autoComplete="off" autoCorrect="off"
            autoCapitalize="off" spellCheck={false} enterKeyHint="send" readOnly={!canEdit}
            hidden={accepted}
            disabled={view.phase !== 'Answering' || accepted || !connected}
            aria-invalid={!!error} aria-describedby="answer-feedback"
            onChange={(event) => { if (canEdit) { setDraft(event.target.value); setLocalError(null); } }}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={keyDown} />
        </div>
        <button type="submit" disabled={!canEdit || !trimOuterWhitespace(draft) || !!lengthError}>{checking ? 'Checking…' : 'Submit'}</button>
      </form>
      <div id="answer-feedback" className="answer-feedback" aria-live="polite" aria-atomic="true">
        {accepted ? <p className="accepted-message">Answer accepted. Waiting for the round to finish.</p>
          : checking ? <p>{feedback?.status === 'confirming' ? 'Confirming your answer…' : 'Checking…'}</p>
          : view.phase === 'Reading' ? <p>Read first. Answering opens automatically.</p>
          : !connected ? <p>Waiting for the current game state. Your draft is kept on this page.</p>
          : remaining === 0 ? <p>Closing round… Waiting for the server.</p>
          : error ? <p className="field-error">{error}</p>
          : null}
      </div>
      {state.error && !['TAB_SUPERSEDED', 'CONTROL_CONFIRMATION_REQUIRED'].includes(state.error.code) && connected &&
        <p className="field-error" role="alert">{playerErrorMessage(state.error)}</p>}
    </div>
  </section>;
}

function Results({ state, view, cinematic }: {
  state: ClientSnapshot;
  view: Extract<PlayerView, { phase: 'Results' }>;
  cinematic: boolean;
}) {
  const [tab, setTab] = useState<'answers' | 'standings'>('answers');
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const covered = useRef(cinematic);
  useLayoutEffect(() => {
    const restored = covered.current && !cinematic;
    covered.current = cinematic;
    if (restored && state.status === 'connected' && !document.hidden && document.hasFocus() &&
      document.activeElement === document.body) heading.current?.focus({ preventScroll: true });
  }, [cinematic, state.status]);
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : tab === 'answers' ? 1 : 0;
    setTab(next === 0 ? 'answers' : 'standings');
    buttons.current[next]?.focus();
  }
  return <section className="player-results" aria-labelledby="results-heading">
    <div className="status-strip"><span>Round {view.roundIndex + 1} of {view.promptCount}</span><span>{view.standings.find((row) => row.playerId === view.ownPlayer.playerId)?.publishedTotal ?? 0} points</span></div>
    <div className="panel result-card">
      <h1 ref={heading} id="results-heading" data-phase-heading tabIndex={-1} aria-describedby="personal-result">Round complete</h1>
      <div id="personal-result" aria-live="polite"><PersonalOutcome result={view.ownResult} /></div>
      <Timer deadlineMs={view.phaseDeadlineMs} clockOffsetMs={state.clockOffsetMs} phaseId={view.phaseId} label={view.roundIndex + 1 === view.promptCount ? 'Final results in' : 'Next round in'} />
    </div>
    <div className="result-tabs" role="tablist" aria-label="Round results">
      {(['answers', 'standings'] as const).map((name, i) => <button key={name} type="button" role="tab" id={`${name}-tab`}
        aria-controls={`${name}-panel`} aria-selected={tab === name} tabIndex={tab === name ? 0 : -1}
        ref={(node) => { buttons.current[i] = node; }} onClick={() => setTab(name)} onKeyDown={tabKey}>{name === 'answers' ? 'Answers' : 'Standings'}</button>)}
    </div>
    <div id="answers-panel" className="panel results-tab-panel" role="tabpanel" aria-labelledby="answers-tab" hidden={tab !== 'answers'} tabIndex={0}>
      <AnswerGroups results={view.results} headingLevel={2} />
    </div>
    <div id="standings-panel" className="panel results-tab-panel" role="tabpanel" aria-labelledby="standings-tab" hidden={tab !== 'standings'} tabIndex={0}>
      <Standings rows={view.standings} ownPlayerId={view.ownPlayer.playerId} limit={5} />
    </div>
  </section>;
}

function Finished({ client, state, view }: PlayerProps & { view: Extract<PlayerView, { phase: 'Finished' }> }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const own = view.standings.find((row) => row.playerId === view.ownPlayer.playerId);
  const winners = view.standings.filter((row) => view.winnerIds.includes(row.playerId));
  return <section className="player-finished" aria-labelledby="finished-heading">
    <div className="panel final-summary">
      <p className="eyebrow">Expedition complete</p>
      <h1 id="finished-heading" data-phase-heading tabIndex={-1}>Final results</h1>
      {own ? <><p className="final-rank">Rank {own.rank}</p><p className="points">{own.publishedTotal} <span>points</span></p><p>{view.ownPlayer.nickname}</p></>
        : <p>No players remaining</p>}
      {winners.length > 0 && <div className="winners"><h2>{winners.length > 1 ? 'Joint winners' : 'Winner'}</h2><ul>{winners.map((winner) => <li key={winner.playerId}>{winner.nickname}</li>)}</ul></div>}
      <p className="hint">Results stay here until the host replaces the game or stops hosting.</p>
    </div>
    <section className="panel" aria-labelledby="final-standings"><h2 id="final-standings">Final standings</h2><Standings rows={view.standings} ownPlayerId={view.ownPlayer.playerId} /></section>
    <section className="panel round-recaps" aria-labelledby="your-recap"><h2 id="your-recap">Your round recap</h2>
      {view.rounds.map((round) => {
        const open = expanded === round.roundId;
        const detail = view.requestedDetail?.roundId === round.roundId ? view.requestedDetail.results : state.recapCache[round.roundId];
        return <article className="round-recap" key={round.roundId}>
          <h3>Round {round.roundIndex + 1}</h3>
          <p className="recap-prompt">{round.prompt}</p>
          <PersonalOutcome result={round.ownResult} compact />
          <button type="button" className="secondary" aria-expanded={open} aria-controls={`recap-${round.roundIndex}`}
            disabled={state.status !== 'connected' || (state.pending !== null && !open)}
            onClick={() => { setExpanded(open ? null : round.roundId); if (!open && !detail) void client.recap(round.roundId); }}>
            {open ? 'Hide answer counts' : 'Show answer counts'}<span className="sr-only"> for round {round.roundIndex + 1}</span>
          </button>
          {open && <div id={`recap-${round.roundIndex}`} className="recap-detail">
            {detail ? <AnswerGroups results={detail} /> : <p role="status">{state.pending?.kind === 'recap' ? 'Loading round details…' : 'Round details could not be loaded.'}</p>}
            {!detail && state.pending === null && <button type="button" onClick={() => void client.recap(round.roundId)} disabled={state.status !== 'connected'}>Retry round details</button>}
          </div>}
        </article>;
      })}
      {state.error && <p className="field-error" role="alert">{playerErrorMessage(state.error)}</p>}
    </section>
  </section>;
}

export function Player({ client, state, revealActive = false, cinematic = false }: PlayerProps & { revealActive?: boolean; cinematic?: boolean }) {
  const [help, setHelp] = useState(false);
  const view = state.view?.viewRole === 'player' ? state.view : null;
  const canHelp = !view || view.phase === 'Lobby';
  useEffect(() => { if (!canHelp) setHelp(false); }, [canHelp]);
  const contextKey = view ? `${view.serverInstanceId}:${view.gameId}` : 'joining';
  const content = state.status === 'removed' || state.status === 'closed' ? <Terminal state={state} />
    : view?.phase === 'Lobby' ? <Lobby view={view} showHelp={() => setHelp(true)} />
    : view?.phase === 'Reading' || view?.phase === 'Answering' ? <LiveRound key={`${contextKey}:${view.roundId}`} client={client} state={state} view={view} />
    : view?.phase === 'Results' ? <Results key={`${contextKey}:${view.roundId}`} state={state} view={view} cinematic={cinematic} />
    : view?.phase === 'Finished' ? <Finished key={contextKey} client={client} state={state} view={view} />
    : state.session?.role === 'guest' ? <Join client={client} state={state} showHelp={() => setHelp(true)} />
    : <section className="panel rejoining-panel" aria-labelledby="rejoining-heading"><h1 id="rejoining-heading" data-phase-heading tabIndex={-1}>Rejoining game…</h1><p>Checking this browser’s session with the host.</p></section>;
  return <main className="player-screen" data-round-reveal={revealActive ? 'playing' : undefined}>
    {!['closed', 'removed'].includes(state.status) && <ConnectionNotice client={client} state={state} />}
    {content}
    {help && canHelp && <HowToPlay close={() => setHelp(false)} />}
  </main>;
}

export { PersonalOutcome };
