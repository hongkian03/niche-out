# Epic 7 · Personal Follow dive

The live player app now uses the approved Follow dive. The submarine holds its opening pose for 250 ms, travels through 1.4 seconds of motion, then holds the settled shot for 300 ms with the exact points and authored tier. The results stay mounted during the scene. When they return, the canonical answer, submitted alias, countdown and standings remain available. The Results heading can receive focus when the player is still in the foreground and focus is free.

Production and the motion comparison use the same scene and timing. The Story 3 lifecycle bounds the reveal against the server's phase deadline. Accepted zero, misses, short windows, recovered views, reduced motion and older views without a depth band show immediate results. [Scene](../../../apps/web/src/dive-scene.tsx) · [App integration](../../../apps/web/src/App.tsx) · [Player results](../../../apps/web/src/Player.tsx)

## Depth mapping

Prompt compilation ranks the distinct positive points assigned to its reachable answers and precomputes a lookup. A single score maps to medium. Two scores map to low and high. Three or more use the nearest of three evenly spaced ranks. Ties share a depth. This lets the same award land at different depths on different prompts.

The server sends the optional `ownResult.diveBand` hint only for the player's own positive Results outcome. New clients accept older views without the field and show their static results. Serve the matching browser and server build together. [Compiler](../../../packages/game-core/src/compile.ts) · [Projection](../../../packages/game-core/src/projections.ts) · [View contract](../../../packages/contracts/src/views.ts)

## Verification

Typecheck, the production build, and all 487 application tests passed. The Chrome layout suite passed 213 layout checks, the six lifecycle groups, and the three Follow reveal groups. The automated accessibility suite passed 88 checks with zero violations, with some colour-contrast cases marked incomplete.

- Core tests cover tied custom tiers, aliases, extreme safe-integer scores, one and two reachable values, zeros and misses, and the private Results-only field.
- The built Chrome app and real local HTTPS server completed a three-player round with low, medium and high dives. Exact final scores were 12, 38 and 72, and the high scorer's submitted alias survived the reveal. Reloading Results did not replay the dive.
- Browser fixtures exercise all three poses, the opening and landing holds, keyboard restoration, long labels and safe-integer scores at 320 px, and the immediate-results cases. [Browser checks](../../../probes/web/follow-dive.mjs)
- The comparison prototype passed its existing motion checks and regenerated its review captures.

Physical mobile keyboard and assistive technology verification remain part of the release checks in Story 6.
