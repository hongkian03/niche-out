import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

export type RevealedAnswer = { canonicalText: string; tierName: string; points: number };
export type PublicResults = { groups: (RevealedAnswer & { count: number })[]; unused: RevealedAnswer | null };
export type OwnResult = (RevealedAnswer & { outcome: 'accepted'; submittedText: string }) | { outcome: 'miss'; points: 0 };
export type Standing = { playerId: string; nickname: string; rank: number; publishedTotal: number; roundPoints?: number };
export type RecapRound = { roundId: string; roundIndex: number; prompt: string; ownResult?: OwnResult };

export function Panel({ children, title, className = '' }: { children: ReactNode; title?: string; className?: string }) {
  return <section className={`panel ${className}`}>{title && <h2>{title}</h2>}{children}</section>;
}

/** Native modal dialogs contain focus and make the underlying game inert, including nested confirmations. */
export function Dialog({ open, title, onClose, children, initialFocusRef }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null), titleId = useId();
  useEffect(() => {
    if (!open || !ref.current) return;
    const dialog = ref.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    const initial = initialFocusRef?.current ?? dialog.querySelector<HTMLElement>('[data-initial-focus]');
    initial?.focus();
    return () => {
      dialog.close();
      const usable = opener?.isConnected && !opener.matches(':disabled,[hidden]') && !opener.closest('[inert]') && opener.getClientRects().length > 0;
      if (usable) opener.focus({ preventScroll: true });
      if (!usable || document.activeElement !== opener) {
        const remaining = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].at(-1);
        const target = remaining?.querySelector<HTMLElement>('h2') ?? document.querySelector<HTMLElement>('[data-phase-heading]');
        if (target) { target.tabIndex = -1; target.focus({ preventScroll: true }); }
      }
    };
  }, [open, initialFocusRef]);
  if (!open) return null;
  return <dialog ref={ref} className="game-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onKeyDown={(event) => {
    if (event.key !== 'Tab') return;
    const dialog = event.currentTarget;
    const targets = [...dialog.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,summary,[tabindex]')]
      .filter(target => target.tabIndex >= 0 && !target.matches(':disabled,[hidden]') && target.getClientRects().length > 0);
    const first = targets[0], last = targets.at(-1);
    if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !targets.includes(document.activeElement as HTMLElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}>
    <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button secondary" aria-label={`Close ${title}`} onClick={onClose}>×</button></div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}

export function formatRemaining(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : String(seconds);
}

export function Timer({ deadlineMs, clockOffsetMs, label = 'Time remaining', phaseId, compact = false }: {
  deadlineMs: number; clockOffsetMs: number; label?: string; phaseId?: string; compact?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  const duration = useRef({ key: phaseId ?? String(deadlineMs), value: Math.max(1, deadlineMs - Date.now() - clockOffsetMs) });
  if (duration.current.key !== (phaseId ?? String(deadlineMs))) duration.current = {
    key: phaseId ?? String(deadlineMs), value: Math.max(1, deadlineMs - Date.now() - clockOffsetMs),
  };
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(id); }, []);
  const remaining = Math.max(0, deadlineMs - now - clockOffsetMs), seconds = Math.ceil(remaining / 1000);
  const fraction = Math.min(1, remaining / duration.current.value);
  const urgency = seconds <= 3 ? 'urgent' : seconds <= 5 ? 'warning' : 'normal';
  // Retain the same ring size for the phase when a minute-sized countdown crosses 59 seconds.
  return <div className={`timer ${compact ? 'timer-compact' : ''} ${duration.current.value > 59000 ? 'timer-long' : ''} timer-${urgency}`} style={{ '--remaining': fraction } as CSSProperties}>
    <div className="timer-ring" aria-hidden="true"><span>{formatRemaining(remaining)}</span></div>
    <div className="timer-copy"><span>{label}</span><span className="sr-only">: {seconds} seconds</span>
      <div className="time-track" aria-hidden="true"><div /></div>
      <span className="sr-only" role="status">{seconds === 0 ? 'Closing phase. Synchronizing with the server.' : seconds <= 5 ? 'Five seconds or less remaining.' : ''}</span>
    </div>
  </div>;
}

export function Standings({ rows, ownPlayerId, limit }: { rows: Standing[]; ownPlayerId?: string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!rows.length) return <p className="empty-state">No players remaining.</p>;
  const sliced = limit && !expanded ? rows.slice(0, limit) : rows;
  const own = ownPlayerId ? rows.find((row) => row.playerId === ownPlayerId) : undefined;
  const visible = own && !sliced.some((row) => row.playerId === ownPlayerId) ? [...sliced, own] : sliced;
  const hasRound = rows.some((row) => row.roundPoints !== undefined);
  return <div className="standings">
    <div className="table-scroll" role="region" aria-label="Standings" tabIndex={0}>
      <table><thead><tr><th scope="col">Rank</th><th scope="col">Player</th>{hasRound && <th scope="col">Round</th>}<th scope="col">Total</th></tr></thead>
        <tbody>{visible.map((row) => <tr key={row.playerId} className={`${row.playerId === ownPlayerId ? 'is-you' : ''} ${row.rank === 1 ? 'is-leading' : ''}`}>
          <td className="rank">{row.rank}</td><th scope="row">{row.nickname}{row.playerId === ownPlayerId && <span className="you-label">You</span>}</th>
          {hasRound && <td>+{row.roundPoints ?? 0}</td>}<td className="total-points">{row.publishedTotal}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {limit && rows.length > limit && <button className="text-button" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show leading players' : `Show all ${rows.length} players`}</button>}
  </div>;
}

export function AnswerGroups({ results, headingLevel = 3 }: { results: PublicResults; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <div className="answer-groups">
    <Heading className="answer-groups-heading">Answers from this round</Heading>
    {results.groups.length === 0 ? <p className="empty-state">No accepted answers this round.</p> : <ul className="answer-list">{results.groups.map((answer, index) =>
      <li key={`${index}:${answer.canonicalText}`}><div className="answer-name"><strong>{answer.canonicalText}</strong><span className="tier-label">{answer.tierName} · {answer.points} points</span></div><span className="answer-count">{answer.count}<small>{answer.count === 1 ? 'answer' : 'answers'}</small></span></li>,
    )}</ul>}
    {results.unused && <div className="unused-answer"><p className="eyebrow">Nobody chose this</p><strong>{results.unused.canonicalText}</strong><span>{results.unused.tierName} · {results.unused.points} points</span></div>}
  </div>;
}

export function RoundRecaps({ rounds, cache, onRequest }: { rounds: RecapRound[]; cache: Record<string, PublicResults>; onRequest: (roundId: string) => void }) {
  return <div className="round-recaps">{rounds.map((round) => <details key={round.roundId} onToggle={(event) => {
    if (event.currentTarget.open && !cache[round.roundId]) onRequest(round.roundId);
  }}>
    <summary><span className="eyebrow">Round {round.roundIndex + 1}</span><span className="recap-prompt">{round.prompt}</span>{round.ownResult && <span className="recap-points">+{round.ownResult.points}</span>}</summary>
    <div className="recap-body">
      {round.ownResult && <div className="recap-own"><h3>Your answer</h3>{round.ownResult.outcome === 'miss' ? <p>No accepted answer · +0</p> : <>
        <p><strong>{round.ownResult.canonicalText}</strong> · {round.ownResult.tierName} · +{round.ownResult.points}</p>
        {round.ownResult.submittedText !== round.ownResult.canonicalText && <p className="muted">You entered: {round.ownResult.submittedText}</p>}
      </>}</div>}
      {cache[round.roundId] ? <AnswerGroups results={cache[round.roundId]} /> : <div role="status"><p>Loading round details…</p><button className="secondary" type="button" onClick={() => onRequest(round.roundId)}>Retry round details</button></div>}
    </div>
  </details>)}</div>;
}

/** Original SVG scenery; no external images, tracking pixels, or reference-game artwork. */
export function Ocean({ depth = 0, finished = false }: { depth?: number; finished?: boolean }) {
  return <div className={`ocean-scene ${finished ? 'ocean-finished' : ''}`} style={{ '--depth': Math.min(1, Math.max(0, depth)) } as CSSProperties} aria-hidden="true">
    <div className="ocean-rays" /><div className="ocean-grid" />
    <svg className="ocean-horizon" viewBox="0 0 1440 200" preserveAspectRatio="none"><path fill="#24485b" d="M0 110h80v-8h92v12h122v-8h86v8h146v-6h84v-10h76v10h110v10h120v-8h136v-8h82v12h116v-10h120v8h70v88H0z"/><path fill="#326176" d="M0 119h120v8h80v-8h152v10h134v-12h142v8h104v-10h136v10h156v-8h112v10h154v-8h150v81H0z"/><path fill="#497e8f" d="M0 121h120v4H0zm352 6h134v4H352zm276-4h104v4H628zm396-8h112v4h-112zm266 2h150v4h-150z"/></svg>
    <svg className="submarine" viewBox="0 0 240 116" shapeRendering="crispEdges"><path fill="#08121e" d="M42 42h10V32h76V12h12v28h48v10h16v12h14v24h-14v10H62V84H42z"/><path fill="#d6f36a" d="M54 48h12V38h48v10h60v10h18v28H66V76H54z"/><path fill="#a8bd51" d="M66 76h126v10H66zm48-28h12v10h-12z"/><path fill="#69e1e8" d="M132 16h8v24h-8zM78 50h24v22H78zm48 6h20v18h-20zm36 4h16v14h-16z"/><path fill="#172d42" d="M82 54h16v14H82zm48 6h12v10h-12zm36 4h8v6h-8z"/><path fill="#547c90" d="M24 48h18v32H24zm8-12h8v12h-8zm0 44h8v12h-8z"/><path fill="#ffd078" d="M192 64h8v12h-8z"/><path fill="#69e1e8" opacity=".12" d="m200 66 38-20v48l-38-20z"/></svg>
    <i className="bubble bubble-one"/><i className="bubble bubble-two"/><i className="bubble bubble-three"/>
    <svg className="seabed" viewBox="0 0 1440 120" preserveAspectRatio="none"><path fill="#10283a" d="M0 74h80V62h80v20h120V60h40v14h260V88h300V66h120v14h220V58h80v26h140v36H0z"/><path fill="#1d4751" d="M50 95V54h8v-8h8v8h-8v20h14V38h8v57zm32 0V62h8V48h8v14h-8v33zm1256 10V44h8v-8h8v8h-8v28h16V20h8v85zm-20 0V66h8V52h8v14h-8v39z"/></svg>
  </div>;
}
