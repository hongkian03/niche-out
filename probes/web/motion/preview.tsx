import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GameClient } from '../../../apps/web/src/client.js';
import { Ocean } from '../../../apps/web/src/components.js';
import { HostMotion } from './HostMotion.js';
import { PlayerMotion, type PlayerMode } from './PlayerMotion.js';
import { TierComparison } from './TierComparison.js';
import { buildDemoSnapshot, lastRound, matchDemoAnswer, scenarios, seconds, type Demo, type Phase, type Role, type Scenario } from './preview-state.js';
import '../../../apps/web/src/styles.css';
import './preview.css';

type HostMode = 'pulse' | 'distribution';
type Switches = { playerMode: PlayerMode; hostMode: HostMode; static: boolean; short: boolean };
type Selection = Partial<Pick<Demo, 'phase' | 'role' | 'scenario' | 'ready' | 'crewSize' | 'emptyResults'>> & Partial<Switches>;
const query = new URLSearchParams(location.search);
const capture = location.pathname === '/capture';
const phases: Phase[] = ['Reading', 'Answering', 'Results', 'Finished'];
const hostDurationMs = 600;
const outcomeLabels: Record<Scenario, string> = {
  low: 'Low (+12)', medium: 'Medium (+38)', high: 'High (+72)', zero: 'Accepted zero', miss: 'Miss',
};

function createDemo(role: Role, phase: Phase, scenario: Scenario, short: boolean): Demo {
  return {
    role, phase, scenario, round: 1, played: null, phaseKey: 1, revision: 1,
    deadline: Date.now() + (short && phase === 'Results' ? 100 : seconds[phase] * 1000),
    ready: 6, crewSize: 24, submittedText: null, rejectedText: null, removedPlayers: [], emptyResults: false,
  };
}

function enter(demo: Demo, phase: Phase, short: boolean, round: Demo['round'] = demo.round): Demo {
  return {
    ...demo, phase, round, phaseKey: demo.phaseKey + 1, revision: demo.revision + 1,
    deadline: Date.now() + (short && phase === 'Results' ? 100 : seconds[phase] * 1000),
    ...(phase === 'Reading' ? { ready: 0, submittedText: null, rejectedText: null } : {}),
  };
}

// Browser-only fixtures use the production view schemas and components. Selectors and synthetic
// transitions belong to the review harness, outside the rendered role's gameplay controls.
function Preview() {
  const [switches, setSwitches] = useState<Switches>({
    playerMode: 'wide',
    hostMode: 'distribution',
    static: false,
    short: false,
  });
  const [demo, setDemo] = useState(() => {
    const phase = capture ? phases.find(phase => phase.toLowerCase() === query.get('phase')) : undefined;
    return createDemo(capture && query.get('role') === 'host' ? 'host' : 'player',
      phase ?? 'Answering', 'high', switches.short);
  });
  const [viewing, setViewing] = useState(capture);
  const [playing, setPlaying] = useState(false);
  const [playReveal, setPlayReveal] = useState(false);
  const state = useMemo(() => buildDemoSnapshot(demo), [demo]);

  function show(selection: Selection) {
    const phase = selection.phase;
    const short = selection.short ?? switches.short;
    if (phase) setViewing(true);
    if (phase || selection.role || selection.scenario) setPlaying(false);
    if (selection.role) setViewing(false);
    setSwitches(previous => ({
      playerMode: selection.playerMode ?? previous.playerMode, hostMode: selection.hostMode ?? previous.hostMode,
      static: selection.static ?? previous.static, short: selection.short ?? previous.short,
    }));
    if (phase || selection.role || selection.scenario || selection.short !== undefined) {
      setPlayReveal(phase === 'Results' && demo.phase === 'Answering' && !short);
    }
    setDemo(previous => {
      const next = {
        ...previous,
        role: selection.role ?? previous.role, scenario: selection.scenario ?? previous.scenario,
        ready: selection.ready ?? previous.ready, crewSize: selection.crewSize ?? previous.crewSize,
        emptyResults: selection.emptyResults ?? previous.emptyResults,
        revision: previous.revision + 1,
        ...(selection.scenario !== undefined ? { submittedText: null, rejectedText: null } : {}),
      };
      return phase ? enter({ ...next, played: null }, phase, short, 1) : next;
    });
  }

  function play() {
    setViewing(true);
    setPlayReveal(false);
    setDemo(previous => enter({ ...previous, played: {}, removedPlayers: [] }, 'Reading', switches.short, 0));
    setPlaying(true);
  }

  function previewReveal(mode?: PlayerMode) {
    if (mode) setSwitches(previous => ({ ...previous, playerMode: mode }));
    setViewing(true);
    setPlaying(false);
    setPlayReveal(true);
    setDemo(previous => enter({ ...previous, played: null, submittedText: null }, 'Results', switches.short, 1));
  }

  useEffect(() => {
    if (!playing || demo.phase === 'Finished') return;
    const timer = window.setTimeout(() => {
      if (demo.phase === 'Reading') {
        setPlayReveal(false);
        setDemo(previous => enter(previous, 'Answering', switches.short));
      } else if (demo.phase === 'Answering') {
        setPlayReveal(!switches.short);
        setDemo(previous => {
          const scenario = previous.role === 'host' || previous.submittedText ? previous.scenario : 'miss';
          const played = { ...previous.played, [previous.round]: { scenario, submittedText: previous.submittedText } };
          return enter({ ...previous, played }, 'Results', switches.short);
        });
      } else {
        setPlayReveal(false);
        if (demo.round === lastRound) {
          setDemo(previous => enter(previous, 'Finished', switches.short));
          setPlaying(false);
        } else {
          setDemo(previous => enter(previous, 'Reading', switches.short, demo.round === 0 ? 1 : 2));
        }
      }
    }, Math.max(0, demo.deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [playing, demo.phase, demo.deadline, demo.round, switches.short]);

  const client = {
    async submit(text: string) {
      const matched = matchDemoAnswer(text, demo.round);
      setDemo(previous => previous.phase !== 'Answering' || previous.submittedText || Date.now() >= previous.deadline ? previous : {
        ...previous, revision: previous.revision + 1, scenario: matched ?? previous.scenario,
        submittedText: matched ? text : null, rejectedText: matched ? null : text,
      });
    },
    async remove(playerId: string) {
      setDemo(previous => ({ ...previous, revision: previous.revision + 1, removedPlayers: [...new Set([...previous.removedPlayers, playerId])] }));
    },
    async recap() {},
    clearError() {},
    discardCandidate() {},
  } as unknown as GameClient;

  // Capture scripts drive only synthetic phase snapshots through this entry point.
  useEffect(() => { Object.assign(window, { motionPreview: { show } }); });

  const outcome = demo.played?.[demo.round]?.scenario ?? demo.scenario;
  const band = outcome === 'low' ? 'low' : outcome === 'high' ? 'high' : 'medium';
  const animate = playReveal && !switches.static && !switches.short;
  const depth = demo.phase === 'Finished' ? 1 : (demo.round + 1) / 3;
  return <>
    {!capture && <aside className="motion-review-controls" aria-label="Prototype controls">
      <div className="motion-review-heading">
        <h1>Niche Out Motion Preview</h1>
        <p>Choose a dive to replay the score reveal, or play the three-round sample game.</p>
      </div>
      <div className="motion-review-options">
        <label>View<select value={demo.role} onChange={event => show({ role: event.target.value as Role })}><option value="player">Player</option><option value="host">Host</option></select></label>
        {demo.role === 'player' ? <>
          <label>Outcome<select disabled={playing} value={demo.scenario} onChange={event => show({ scenario: event.target.value as Scenario })}>{scenarios.map(key => <option key={key} value={key}>{outcomeLabels[key]}</option>)}</select></label>
        </> : <>
          <label>Results<select value={switches.hostMode} onChange={event => show({ hostMode: event.target.value as HostMode })}><option value="pulse">Pulse only</option><option value="distribution">Pulse + distribution</option></select></label>
          <label>Crew<select value={demo.crewSize} onChange={event => show({ crewSize: Number(event.target.value) })}><option value="24">24 players</option><option value="100">100 players</option></select></label>
        </>}
      </div>
      <div className="motion-review-actions motion-review-primary">
        {demo.role === 'player' ? <>
          <button type="button" onClick={() => previewReveal('wide')}>Wide dive</button>
          <button type="button" onClick={() => previewReveal('follow')}>Follow dive</button>
          <a href="/motion-preview/tiers/">Compare Follow tiers</a>
        </> : <button type="button" onClick={() => previewReveal()}>Preview host reveal</button>}
        <button type="button" onClick={play} disabled={playing}>Play sample game</button>
      </div>
      {demo.role === 'player' && <details>
        <summary>Sample answers</summary>
        <ol><li>Mesosphere</li><li>Hyperion</li><li>Anemometer</li></ol>
      </details>}
      <details>
        <summary>Advanced preview controls</summary>
        <div className="motion-review-options">
          <label><input type="checkbox" checked={switches.static} onChange={event => show({ static: event.target.checked })} /> Static reveal</label>
          <label><input type="checkbox" checked={switches.short} onChange={event => show({ short: event.target.checked })} /> 0.1s results</label>
        </div>
        <div className="motion-review-actions" aria-label="Inspect a single phase">
          {phases.map(phase => <button type="button" key={phase} aria-pressed={viewing && !playing && demo.phase === phase} onClick={() => show({ phase })}>{phase}</button>)}
        </div>
      </details>
    </aside>}
    {viewing && <div data-demo-phase={demo.phase} data-demo-revision={demo.revision} className={`app-frame motion-preview ${demo.role === 'host' ? 'app-host' : 'app-player'}`}>
      <Ocean depth={depth} finished={demo.phase === 'Finished'} />
      <header className="app-header"><div className="brand"><span className="brand-symbol" aria-hidden="true">↧</span><div className="wordmark">NICHE OUT</div></div></header>
      {demo.role === 'player' ? <PlayerMotion client={client} state={state} mode={switches.playerMode} animate={animate} band={band} />
        : <HostMotion client={client} state={state} mode={switches.hostMode} animate={animate} durationMs={hostDurationMs} />}
      <footer className="app-footer"><a href="/asset-notices.txt" target="_blank" rel="noreferrer">Asset credits</a></footer>
    </div>}
  </>;
}

const comparing = location.pathname.replace(/\/$/, '') === '/motion-preview/tiers';
createRoot(document.getElementById('app')!).render(comparing ? <TierComparison /> : <Preview />);
