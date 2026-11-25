import { useState } from 'react';
import { DiveScene, diveTravel } from '../../../apps/web/src/dive-scene.js';
import { saturnAwards } from './preview-state.js';
import './tier-comparison.css';

const bands = ['low', 'medium', 'high'] as const;

export function TierComparison() {
  const [replay, setReplay] = useState(0);

  return <main className="tier-comparison">
    <a className="tier-comparison__back" href="/motion-preview/">Back to motion preview</a>
    <h1>Follow dive tiers</h1>
    <p>All three hold at the dashed line, then dive together. Replay the sequence to compare their landing depths.</p>
    <button type="button" className="primary" onClick={() => setReplay(previous => previous + 1)}>Replay all three</button>
    <p className="tier-comparison__reduced">Reduced motion is on. The panels show the landing positions.</p>
    <div className="tier-comparison__grid">
      {bands.map(band => {
        const { points, tierName } = saturnAwards[band];
        const { craft, scenery } = diveTravel.follow[band];
        return <figure className="tier-comparison__card" key={band}>
          <figcaption><strong>+{points}</strong><span>{tierName}</span></figcaption>
          <div className="tier-comparison__frame">
            <DiveScene key={replay} mode="follow" band={band} points={points} tier={tierName} landed={replay === 0} />
            <div className="tier-comparison__start" aria-hidden="true" />
          </div>
          <p><span>Sub drops {craft}%</span><span>Terrain rises {scenery}%</span></p>
        </figure>;
      })}
    </div>
    <p>Distances are percentages of each panel’s height. Accepted zero and missed answers go straight to results.</p>
  </main>;
}
