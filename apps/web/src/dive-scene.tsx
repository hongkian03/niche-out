import type { CSSProperties } from 'react';
import type { DiveBand } from '@rarity/contracts';
import './dive-scene.css';

export type PlayerMode = 'wide' | 'follow';

const descentMs = 1400;
const diveTiming = {
  wide: { leadInMs: 0, landingHoldMs: 0 },
  follow: { leadInMs: 250, landingHoldMs: 300 },
};
export function diveDurationMs(mode: PlayerMode): number {
  const { leadInMs, landingHoldMs } = diveTiming[mode];
  return leadInMs + descentMs + landingHoldMs;
}

export const diveTravel = {
  wide: {
    low: { craft: 18, scenery: 14 },
    medium: { craft: 34, scenery: 32 },
    high: { craft: 52, scenery: 53 },
  },
  follow: {
    low: { craft: 12, scenery: 31 },
    medium: { craft: 22, scenery: 60 },
    high: { craft: 34, scenery: 92 },
  },
};

export function DiveScene({ mode, band, points, tier, landed = false }: {
  mode: PlayerMode;
  band: DiveBand;
  points: number;
  tier: string;
  landed?: boolean;
}) {
  const distance = diveTravel[mode][band];
  const award = `+${points}`;
  const style = {
    '--award-columns': award.length,
    '--dive-duration': `${descentMs}ms`,
    '--dive-lead-in': `${diveTiming[mode].leadInMs}ms`,
    '--craft-drop': `calc(${distance.craft / 100} * var(--scene-height))`,
    '--scenery-rise': `calc(${-distance.scenery / 100} * var(--scene-height))`,
  } as CSSProperties;
  return (
    <div className="player-cinematic" data-mode={mode} data-band={band} data-landed={landed} style={style} aria-hidden="true">
      <div className="player-cinematic__water" />
      <svg className="player-cinematic__terrain" viewBox="0 0 400 1600" preserveAspectRatio="none" focusable="false">
        <path className="player-cinematic__shelf" d="M0 0H400V100l-34 9v14h-39v13h-42v9h-76v12h-77v-11H73v-17H36v-14H0Z" />
        <path className="player-cinematic__strata" d="M0 175l66 22 55-12 35 13 91-3 48-20 42 9 63-18M0 198l76 25 48-11 33 12 90-3 54-18 38 8 61-19M0 234l41 13 69 3 40 16 87-14 37 4 61-25 65-4" />
        <path className="player-cinematic__far-rock" d="M0 358h28v27h23v42h19v44h30v33H84v23H57v49H34v36H0ZM400 302h-24v33h-19v16h-25v47h-39v22h22v27h18v35h31v50h36Z" />
        <path className="player-cinematic__strata" d="M0 536l56-13 43 16 86-17 49 4 62 27 48-17 56 10M0 565l62-15 41 14 77-12 55 1 59 29 43-19 63 14M0 599l57-13 49 12 74-10 62-1 51 24 47-11 60 16" />
        <path className="player-cinematic__near-rock" d="M0 666h45v24h29v37h19v30h25v47h-36v44H61v49H43v63H0ZM400 614h-49v28h-43v59h-19v28h-21v43h35v48h27v59h22v53h48Z" />
        <path className="player-cinematic__strata" d="M0 920l63 20 43-7 41 19 99 7 70-25 39 7 45-13M0 952l65 14 51-7 30 19 101 7 71-23 36 8 46-15M0 997l65 16 51-6 43 20 97 3 59-27 46 10 39-18M0 1100l57-12 53 22 61 11 65-25 39 14 78-15 47 8" />
        <path className="player-cinematic__near-rock" d="M0 1060h30v22h44v62h23v32h33v44H83v35H67v54H38v73H0Zm400-70h-36v33h-26v72h-35v37h-23v43h37v41h28v67h27v58h28Z" />
      </svg>
      <div className="player-cinematic__particles" />
      <div className="player-cinematic__craft">
        <div className="player-cinematic__wake"><i /><i /><i /><i /></div>
        <svg className="player-cinematic__sub" viewBox="18 4 226 100" shapeRendering="crispEdges" focusable="false">
          <path fill="#08121e" d="M42 42h10V32h76V12h12v28h48v10h16v12h14v24h-14v10H62V84H42z" />
          <path fill="#d6f36a" d="M54 48h12V38h48v10h60v10h18v28H66V76H54z" />
          <path fill="#a8bd51" d="M66 76h126v10H66zm48-28h12v10h-12z" />
          <path fill="#69e1e8" d="M132 16h8v24h-8zM78 50h24v22H78zm48 6h20v18h-20zm36 4h16v14h-16z" />
          <path fill="#172d42" d="M82 54h16v14H82zm48 6h12v10h-12zm36 4h8v6h-8z" />
          <path fill="#547c90" d="M24 48h18v32H24zm8-12h8v12h-8zm0 44h8v12h-8z" />
          <path fill="#ffd078" d="M192 64h8v12h-8z" />
          <path fill="#69e1e8" opacity=".22" d="m200 66 38-20v48l-38-20z" />
        </svg>
        <div className="player-cinematic__award"><strong>{award}</strong><span>{tier}</span></div>
      </div>
    </div>
  );
}
