import { useEffect, useState, useSyncExternalStore } from 'react';
import { GameClient } from './client.js';
import { Host } from './Host.js';
import { Player } from './Player.js';
import { Ocean } from './components.js';
import { DiveScene } from './dive-scene.js';
import { useRoundReveal } from './round-reveal.js';

export function App({ client: supplied }: { client?: GameClient }) {
  const [client] = useState(() => supplied ?? new GameClient());
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot);
  const activeReveal = useRoundReveal(client, state);
  const revealActive = activeReveal === 'player';
  const view = state.view;
  const result = revealActive && view?.viewRole === 'player' && view.phase === 'Results' ? view.ownResult : null;
  const dive = result?.outcome === 'accepted' && result.points > 0 && result.diveBand ?
    <DiveScene key={view?.phaseId} mode="follow" band={result.diveBand} points={result.points} tier={result.tierName} /> : null;
  const isHost = state.session?.role === 'host' || view?.viewRole === 'host';
  const nickname = view?.viewRole === 'player' ? view.ownPlayer.nickname : null;
  const depth = view && view.promptCount > 0 ? (view.phase === 'Finished' ? 1 : (view.roundIndex ?? 0) / view.promptCount) : 0;
  useEffect(() => { void client.boot(); return () => { void client.dispose(); }; }, [client]);
  useEffect(() => { document.title = `Niche Out · ${isHost ? 'Host' : nickname ?? 'Join'}`; }, [isHost, nickname]);
  const conflict = state.status === 'host-conflict';
  const unclaimedHost = location.pathname === '/host' && !view && state.session?.role === 'guest' && !location.hash;
  const failedHostBootstrap = (location.pathname === '/host' || isHost) && !view && ['host-revoked', 'closed'].includes(state.status);
  return <>
    <div className={`app-frame ${isHost ? 'app-host' : 'app-player'}`} data-follow-dive={dive ? true : undefined} inert={!!dive}>
      <Ocean depth={depth} finished={view?.phase === 'Finished'} />
      <header className="app-header"><div className="brand"><span className="brand-symbol" aria-hidden="true">↧</span><div className="wordmark">NICHE OUT</div></div></header>
      {isHost && <p className="sr-only" role="status">{view ? `${view.phase === 'Finished' ? 'Game finished' : view.phase}${view.roundIndex !== null ? `. Round ${view.roundIndex + 1} of ${view.promptCount}` : ''}` : 'Checking host access'}</p>}
      {conflict || unclaimedHost || failedHostBootstrap ? <main className="panel host-problem">
        <h1 id="phase-heading" data-phase-heading tabIndex={-1}>{conflict ? 'This browser is already playing' : 'Open your host page'}</h1>
        <p role="alert">{conflict ? 'Open the private host link in a separate browser profile or private window. Your player and score are preserved.' : 'Use Open host page in the local hosting launcher to restore host access. The game keeps running.'}</p>
        {conflict && <a className="button secondary" href="/join">Continue playing</a>}
      </main> : isHost && view ? <Host client={client} state={state} revealActive={activeReveal === 'host'} /> : <Player client={client} state={state} revealActive={revealActive} cinematic={!!dive} />}
      <footer className="app-footer"><a href="/asset-notices.txt" target="_blank" rel="noreferrer">Asset credits</a></footer>
    </div>
    {dive && <>
      <main className="sr-only"><h1>Revealing your score</h1></main>
      {dive}
    </>}
  </>;
}
