import { useEffect, useState } from 'react';
import type { ClientSnapshot, GameClient } from './client.js';
import { diveDurationMs } from './dive-scene.js';
import { estimatedRemainingMs } from './player-helpers.js';

export const hostRevealDurationMs = 600;
const revealTiming = {
  player: { durationMs: diveDurationMs('follow'), readingMarginMs: 1000 },
  host: { durationMs: hostRevealDurationMs, readingMarginMs: 0 },
};

type RevealRole = keyof typeof revealTiming;

function connectedRound(state: ClientSnapshot) {
  const { view, status, controlGeneration, session } = state;
  if (status !== 'connected' || !view || (view.phase !== 'Answering' && view.phase !== 'Results')) return null;

  const authority: (string | number | undefined)[] = [view.serverInstanceId, view.gameId, view.roundId, view.viewRole, session?.tabId];
  if (view.viewRole === 'player') {
    if (controlGeneration === null || (view.phase === 'Answering' && view.controlGeneration !== controlGeneration)) return null;
    authority.push(view.ownPlayer.playerId, controlGeneration);
  }
  return {
    view,
    roundKey: JSON.stringify(authority),
    phaseKey: JSON.stringify([...authority, view.phaseId]),
  };
}

/** Observe each client update so a disconnect cannot disappear inside a batched React render. */
export function useRoundReveal(client: GameClient, state: ClientSnapshot): RevealRole | null {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let previous: ReturnType<typeof connectedRound> = null;
    const initial = client.getSnapshot();
    let observing = initial.status === 'connected' && !document.hidden && !reducedMotion.matches;
    let retainedView = observing ? null : initial.view;
    let lastResultsRound: string | null = null;
    let active: { phaseKey: string; endTime: number } | null = null;
    let timer: number | undefined;

    function stop() {
      if (!active) return;
      window.clearTimeout(timer);
      active = null;
      setActiveKey(null);
    }

    function observe() {
      const snapshot = client.getSnapshot();
      const wasObserving = observing;
      observing = snapshot.status === 'connected' && !document.hidden && !reducedMotion.matches;
      // A retained Answering view cannot cue a reveal after observation was interrupted.
      if (wasObserving && !observing) retainedView = snapshot.view;
      const next = observing ? connectedRound(snapshot) : null;
      const prior = previous;
      previous = next?.view.phase === 'Answering' && next.view === retainedView ? null : next;

      if (next?.view.phase !== 'Results') {
        stop();
        return;
      }

      const { view, phaseKey, roundKey } = next;
      const { durationMs, readingMarginMs } = revealTiming[view.viewRole];
      const alreadyObserved = lastResultsRound === roundKey;
      lastResultsRound = roundKey;
      const timeLeft = Math.min(
        estimatedRemainingMs(view.phaseDeadlineMs, snapshot.clockOffsetMs, Date.now()),
        view.phaseDeadlineMs - view.serverNowMs,
      );
      const now = window.performance.now();
      if (active) {
        const motionLeft = active.endTime - now;
        if (active.phaseKey !== phaseKey || motionLeft <= 0 || timeLeft < motionLeft + readingMarginMs) stop();
        return;
      }

      if (alreadyObserved || prior?.view.phase !== 'Answering' || prior.roundKey !== roundKey ||
        prior.view.phaseId === view.phaseId || timeLeft < durationMs + readingMarginMs) return;

      active = { phaseKey, endTime: now + durationMs };
      setActiveKey(phaseKey);
      timer = window.setTimeout(stop, durationMs);
    }

    const unsubscribe = client.subscribe(observe);
    document.addEventListener('visibilitychange', observe);
    reducedMotion.addEventListener('change', observe);
    observe();
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
      document.removeEventListener('visibilitychange', observe);
      reducedMotion.removeEventListener('change', observe);
    };
  }, [client]);

  const current = connectedRound(state);
  return current?.view.phase === 'Results' && activeKey === current.phaseKey ? current.view.viewRole : null;
}
