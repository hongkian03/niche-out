# Epic 2 deterministic core handoff

Recorded November 14, 2026 in `~/Projects/niche_out`. The user authorized all nine Epic 2 stories with parallel agents and a coordinator. Compiler, engine and projection contributors owned separate modules/test files; the coordinator fixed shared interfaces, reviewed integration, supplied exports/demo/docs, and ran the combined gate. The [master tracker](../../IMPLEMENTATION-PLAN.md#story-tracker) remains the only mutable story-status source.

G2 is demonstrated by an actual fake-clock multi-round game reaching Finished with correct scores, ranks, private projections, retained removed-player statistics, and clean replacement. No new product decision or manual device step was required.

## Delivered scope and story evidence

| Story | Delivery and verified scenarios | Evidence |
| --- | --- | --- |
| E2-S01 | Frozen canonical/alias indexes; field-specific normalized collisions; duplicate aliases deduplicated; missing tiers, duplicate IDs, unsafe totals rejected; file order retained; private worker transfer roundtrip. | `tests/core/compiler.test.ts` — 16 tests |
| E2-S02 | Setup and explicit atomic commit, fresh game/code, setup generations, failed/stale/timed replacement preserves committed state; immutable snapshots. | `tests/core/engine.test.ts` identity/commit cases |
| E2-S03 | Fixed normalized nicknames, duplicate join recovery, 100 concurrent members including disconnected players, 1,000 lifetime admissions including removed players, fresh-game reset. | Engine admission cases; projection history-limit case |
| E2-S04 | Default/custom deadlines, ordered rounds, stale/duplicate token fencing, last-round finish, empty eligibility waits, one-phase suspension recovery with full next duration. | Engine timing cases; `tests/core/review.test.ts` |
| E2-S05 | Explicit matching, raw wording retained, invalid retries, first accepted lock, strict receipt deadline, accepted zero, disconnected eligibility, positive-size early completion. | Engine answer cases; review delayed-receipt case |
| E2-S06 | Finalize once, manual points regardless of duplication, canonical counts, stable point/file ordering, highest unused example, safe totals and competition ranks. | Engine scoring cases; independent `roundOne` fixture oracle in integration |
| E2-S07 | Disconnection preserves membership; removal excludes standings/eligibility and future resume while retaining statistics; repeated removal, deadline interleavings and empty roster are safe. | Engine removal cases; four independent review tests |
| E2-S08 | Explicit schema-valid complete host/player views in Setup/Lobby/timed/Results; readiness/import guards; only owner sees locked wording; finalized totals only; anonymous groups. | `tests/core/projections.test.ts` — 8 tests including maximum text, history cap, empty-roster Finished and mutation isolation |
| E2-S09 | Own final recaps, joint winners, lazy Finished-only round groups, rejected live history requests, removed/unknown identity denial, old-game invalidation. | `tests/core/integration.test.ts` — 2 complete scenarios; deterministic terminal demo |

The engine suite contains **42 tests**, including review regressions for failed ID generation before transitions and late processing of an on-time receipt. The independent engine review contributes **4 additional tests**. Together with compiler and projection/integration tests, this is **72 Epic 2 tests in five files**.

## Implementation and integration boundaries

- `packages/game-core/src/compile.ts`: reuses the existing strict pack schema and normalization; immutable definitions and closure-private lookup maps. `serializeCompiledPack` plus `hydrateTrustedCompiledPack` allow the required worker compilation path without revalidating/recompiling on the main thread. Hydration is trusted private worker IPC only, never an upload endpoint.
- `packages/game-core/src/engine.ts`: synchronous rules with injected clock, ID/code generators, immutable server snapshots and explicit timer tokens. A scalar occurrence sequence avoids retaining an unbounded ID set across replacements. IDs remain opaque to clients.
- `packages/game-core/src/projections.ts`: selects allowed fields and validates complete views against the existing wire schemas. The caller supplies server-authenticated membership, sanitized hosting status, public invitation and import activity. The internal snapshot contains the answer bank and must never be serialized to clients.
- `scripts/demo-core.mjs`: built-package terminal demonstration, with no real timer, network, tunnel or browser. It checks aliases, rejected retry, accepted zero, a miss, removal, early closure, joint winners and clean replacement.
- [Core API guide](../../../packages/game-core/README.md) documents the Epic 3 adapter contract. Core method results are internal; request-ledger replay, transport errors and authorization still belong to the server.

Production scheduling is deliberately external: the core returns a fenced timer token, the adapter schedules its deadline and calls `wake(token)`, then rearms after state changes. Core `resumeAfterSuspension` implements the policy; detecting actual OS suspension remains E5. Starting requires server-provided readiness, no active import, and at least one admitted member. Tunnel recovery never changes scoring rules.

No input JSON shape, player-facing protocol schema, gameplay rule, or UI requirement changed. PRD/UI remain authoritative. Architecture, core API documentation, README commands and backlog now link this implementation evidence.

## Verification actually run

Environment: macOS 26.5.2 arm64 on the available Apple M3 Pro/18 GiB host, Node **24.22.3**, npm **11.19.1**. The repository has no Git metadata; `build/manifest.json` records the content-derived source digest and dependency/runtime identity.

| Command/check | Result |
| --- | --- |
| `npm run typecheck` | Pass across workspace, probes and tests |
| `npm run build` | Pass for contracts, core, server and web; manifest generated |
| `npm test` | **219 tests passed across 16 files**, including existing Epic 1 regressions |
| `npm run test:core` | **72 tests passed across five files** |
| `npm run demo:core` / final built `node scripts/demo-core.mjs` | Pass; Ada and Ben tie on 200, Cy has 0 with rank 3; replacement has no old members/results |
| `node tests/fixtures/check-browser-assets.mjs` | Pass across nine built/served browser files |
| Source dependency inspection | Core imports only local pure modules and `@rarity/contracts`; no browser, filesystem, socket, real timer, clock or network API calls |

The demo's printed milliseconds are simulated time; it completes immediately. Existing local HTTP/socket regression tests ran with loopback listeners. No new real-provider tunnel was started or claimed as Epic 2 evidence.

## Run it locally

With Node 24.22.3 selected:

```sh
cd ~/Projects/niche_out
npm run test:core
npm run demo:core
```

Expect 72 passing tests and `PASS: deterministic core demonstration completed.` The host/player browser game is not connected yet; `npm run host` continues to show the existing managed hosting/connection diagnostics. A phone test would not exercise this new core until the production adapter and browser flows are implemented.

## Outstanding evidence and next work

No Epic 2 criterion remains open. Next eligible story is **E3-S01**, with G1 and G2 satisfied, awaiting user authorization for the next epic.

Epic 3 owns authenticated protocol dispatch, rate/replay/control guards, worker import/staging, scheduler/clock integration, game lifecycle disposal and real publication of these views. Epic 4 supplies the playable browser screens. Epic 5 owns portable packages and real OS clock/power handling. Epic 6 owns 100-device throughput, large-pack/transfer memory measurements, actual venue/provider/browser qualification and release signing. Capacity-invariant unit tests do not certify those performance/device gates. Finalization currently sorts the configured prompt's answer list; representative large-pack latency/memory measurements should determine whether preordering in the compiler is warranted.
