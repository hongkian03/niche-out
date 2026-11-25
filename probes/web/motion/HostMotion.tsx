import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Host } from '../../../apps/web/src/Host.js';
import type { ClientSnapshot, GameClient } from '../../../apps/web/src/client.js';
import type { PublicResults } from '../../../apps/web/src/components.js';
import './host-motion.css';

export type HostMotionProps = {
  state: ClientSnapshot;
  client: GameClient;
  mode: 'pulse' | 'distribution';
  animate: boolean;
  durationMs: number;
};

function getScoreBuckets(groups: PublicResults['groups']) {
  const counts = new Map<number, number>();
  for (const { points, count } of groups) {
    counts.set(points, (counts.get(points) ?? 0) + count);
  }
  const buckets = Array.from(counts, ([points, count]) => ({ points, count }))
    .sort((a, b) => b.points - a.points);
  if (buckets.length <= 5) return buckets;
  return [
    ...buckets.slice(0, 4),
    { points: null, count: buckets.slice(4).reduce((count, bucket) => count + bucket.count, 0) },
  ];
}

function ScoreDistribution({ groups }: { groups: PublicResults['groups'] }) {
  const buckets = getScoreBuckets(groups);
  const total = groups.reduce((count, group) => count + group.count, 0);
  return <section className="motion-host__distribution" aria-label="Score distribution">
    <h3>Accepted answers by points</h3>
    {total === 0 ? <p>No accepted answers.</p> : <ul>
      {buckets.map(({ points, count }) => <li key={points ?? 'other'}>
        <span className="motion-host__distribution-points">{points === null ? 'Other scores' : `${points} pts`}</span>
        <span className="motion-host__distribution-count">{count}<span className="sr-only"> {count === 1 ? 'answer' : 'answers'}</span></span>
        <span className="motion-host__distribution-track" aria-hidden="true">
          <span style={{ '--motion-host-ratio': count / total } as CSSProperties} />
        </span>
      </li>)}
    </ul>}
  </section>;
}

function Sonar({ active }: { active: boolean }) {
  return <div className="motion-host__sonar" data-animated={active} aria-hidden="true">
    <svg viewBox="0 0 160 84" role="presentation" className="motion-host__radar">
      <path className="motion-host__radar-grid" d="M80 6v72M25 42h110M47 9l66 66M113 9 47 75" />
      <circle className="motion-host__radar-grid" cx="80" cy="42" r="17" />
      <circle className="motion-host__radar-grid" cx="80" cy="42" r="34" />
      <circle className="motion-host__radar-frame" cx="80" cy="42" r="37" />
      <path className="motion-host__sweep" d="M80 42 L54 16 A37 37 0 0 1 88 6 Z" />
      <path className="motion-host__beam" d="M80 42 88 6" />
      <path className="motion-host__contact" d="M79 41h2v2h-2zm-25 14h4v4h-4zm43-37h4v4h-4z" />
    </svg>
    <div className="motion-host__return">
      <span>Sonar return</span>
      <svg viewBox="0 0 150 18" preserveAspectRatio="none" role="presentation">
        <path d="M0 9h30l5-2 5 4 6-2h14l4-5 6 10 5-13 5 16 5-12 6 7 7-3h12l4-2 7 4 4-2h25" />
      </svg>
    </div>
  </div>;
}

export function HostMotion({ state, client, mode, animate, durationMs }: HostMotionProps) {
  const view = state.view?.viewRole === 'host' ? state.view : null;
  const host = useRef<HTMLDivElement>(null);
  const [readinessTarget, setReadinessTarget] = useState<Element | null>(null);
  const [resultTarget, setResultTarget] = useState<Element | null>(null);

  // Attach the prototype additions to the real Host panels without changing their content or focus order.
  useLayoutEffect(() => {
    const frame = host.current;
    setReadinessTarget(frame?.querySelector('.host-stage .host-readiness') ?? null);
    setResultTarget(frame?.querySelector('.host-stage .prompt-panel') ?? null);
  }, [view?.phase, view?.gameId]);

  const readiness = view?.phase === 'Answering' ? view.readiness : null;
  const results = view?.phase === 'Results' ? view.results : null;
  const readyRatio = readiness && readiness.eligible > 0 ? readiness.accepted / readiness.eligible : 0;
  const canAnimate = animate && durationMs > 0 && state.status === 'connected';

  return <div className="motion-host" ref={host}>
    <Host state={state} client={client} />
    {readiness && readinessTarget && createPortal(
      <div className="motion-host__readiness-track" aria-hidden="true" style={{ '--motion-host-ratio': readyRatio } as CSSProperties}>
        <span />
      </div>,
      readinessTarget,
    )}
    {results && resultTarget && createPortal(
      <div className="motion-host__reveal" data-mode={mode} style={{ '--motion-host-duration': `${durationMs}ms` } as CSSProperties}>
        <Sonar active={canAnimate} />
        {mode === 'distribution' && <ScoreDistribution groups={results.groups} />}
      </div>,
      resultTarget,
      view?.phaseId,
    )}
  </div>;
}
