import { useEffect, useState } from 'react';
import type { DiveBand } from '@rarity/contracts';
import { Player } from '../../../apps/web/src/Player.js';
import type { ClientSnapshot, GameClient } from '../../../apps/web/src/client.js';
import { DiveScene, diveDurationMs, type PlayerMode } from '../../../apps/web/src/dive-scene.js';

export type { PlayerMode } from '../../../apps/web/src/dive-scene.js';

interface PlayerMotionProps {
  client: GameClient;
  state: ClientSnapshot;
  mode: PlayerMode;
  band: DiveBand;
  animate: boolean;
}

const resultReadingMarginMs = 1000;

export function PlayerMotion({ state, client, mode, band, animate }: PlayerMotionProps) {
  const [settledPhase, setSettledPhase] = useState<string>();
  const [motionAllowed, setMotionAllowed] = useState(
    () => !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden,
  );
  const view = state.view;
  const resultView = view?.viewRole === 'player' && view.phase === 'Results' ? view : null;
  const result = resultView?.ownResult;
  const phaseId = resultView?.phaseId;
  const revealMs = diveDurationMs(mode);
  const remainingMs = resultView ? resultView.phaseDeadlineMs - Date.now() - state.clockOffsetMs : 0;
  const diving = phaseId !== undefined && settledPhase !== phaseId && !!resultView &&
    animate && motionAllowed && state.status === 'connected' && result?.outcome === 'accepted' &&
    result.points > 0 && remainingMs >= revealMs + resultReadingMarginMs;

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    function syncMotion() {
      const allowed = !preference.matches && !document.hidden;
      setMotionAllowed(allowed);
      if (!allowed && phaseId) setSettledPhase(phaseId);
    }
    preference.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    return () => {
      preference.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncMotion);
    };
  }, [phaseId]);

  useEffect(() => {
    if (!diving) return;
    const timeout = window.setTimeout(() => setSettledPhase(phaseId), revealMs);
    return () => window.clearTimeout(timeout);
  }, [diving, phaseId, revealMs]);

  return (
    <>
      <div className="player-motion-prototype" inert={diving}>
        <Player client={client} state={state} />
      </div>
      {diving && result && <DiveScene key={phaseId} mode={mode} band={band} points={result.points}
        tier={result.tierName} />}
    </>
  );
}
