# Epic 7 · Reveal lifecycle verification

Story 3 is complete as of November 24, 2026. The player app exposes a browser-local reveal window when a live Answering view advances to Results for the same server, game, round and controlling player tab. The window lasts up to 1.95 seconds and reserves at least one additional second to read results. The server deadline and the client clock estimate bound the window.

The reveal observes each accepted client update, including transient connection or control changes that React can batch into one render. It starts once per round. Duplicate or same-phase standings updates preserve the active window, countdown, and focused results tab. A new phase, connection or control loss, hidden tab, reduced motion, or a deadline correction can end the window. A stale Answering view retained after an interruption cannot trigger the next reveal. Results opened directly or recovered during the phase render normally.

[Reveal lifecycle](../../../apps/web/src/round-reveal.ts) · [App integration](../../../apps/web/src/App.tsx) · [Player results integration](../../../apps/web/src/Player.tsx)

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` and `npm run build` | Passed. |
| `npm run test:web` | All 119 web unit tests passed. |
| `npm run test:web:layout` | Passed 213 layout checks and six reveal scenario groups in Chrome. The scenario groups include duplicate updates, early advance, replacement, short windows down to 100 ms, clock correction, reload, reconnect, control loss, hidden tabs and reduced motion. [Browser fixtures](../../../probes/web/reveal-lifecycle.mjs) |
| `npm run test:accessibility` | 88 automated checks, zero violations. Axe left some colour-contrast cases incomplete. The separate layout suite passed its palette checks. |
| Built application over private local HTTPS | A real host and player completed two early-close rounds with the production browser client and game server. Reloading during Results did not replay the window. The final score was 144. |

Story 4 uses this window to render the approved Follow dive and choose the depth for a player's awarded points. Story 6 covers physical-device, assistive-technology and multiplayer verification of the completed motion.
