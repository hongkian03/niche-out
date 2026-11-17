# N04 live player payload verification

Recorded November 17, 2026. This is deterministic contract evidence for the networking extension, not a new public capacity qualification.

## Change and compatibility

The live player Reading/Answering schema and projection omit `publishedStandings`. Personal total, readiness, prompt, deadline and answer-lock state remain. Host live standings and revealed Results/Finished standings remain. Wire version is now **2**; JSON game-pack schema version remains **1**.

Sources: [view contracts](../../../packages/contracts/src/views.ts), [wire contract](../../../packages/contracts/src/wire.ts), [projections](../../../packages/game-core/src/projections.ts), [projection regression](../../../tests/core/projections.test.ts), [protocol regression](../../../tests/protocol/views.test.ts).

## Deterministic byte comparison

| Property | Value |
| --- | --- |
| Players | 100; nicknames `Player 0` through `Player 99` |
| Phase | Reading, first round, zero published totals |
| Game | Title `Byte comparison`; one prompt `Name a colour.`; accepted answer `Amber`; tier `Rare`, 100 points; default timers |
| Engine | Fixed time 1,000 ms; sequential `id-N` IDs; code `123456` |
| Player projection | First admitted player, control generation 1, server time 1,000 ms |
| Previous live-view shape | 7,967 UTF-8 JSON bytes |
| New live-view shape | 454 UTF-8 JSON bytes |
| Reduction | 7,513 bytes, **94.30%** |

The measurement used the compiled game-core implementation after building contracts and core with Node 24.22.3/npm 11.19.1. It captured one immutable state, projected the host and first player, then reconstructed the previous player shape by adding that same state's host `publishedStandings` and setting `protocolVersion: 1`. Both sizes use `Buffer.byteLength(JSON.stringify(view))`. This isolates the removed array; it is not a timed benchmark of the old projection implementation.

The committed regression recreates a 100-player game for both Reading and Answering, checks that the player payload is less than half the reconstructed previous shape, validates the new view, confirms all 100 host standings remain, and verifies 100 tied revealed standings. Exact byte counts vary with IDs, prompt text and nicknames, so the regression tests the meaningful reduction rather than fixing this one synthetic byte total.

## Executed checks

- Contracts build passed.
- Core build passed.
- Focused Vitest run passed **176 tests in 10 files**: `tests/protocol`, `tests/contracts`, `tests/core/projections.test.ts`, `tests/web/player.test.ts`, `tests/web/host.test.ts`, and `tests/web/app.test.ts`.
- Protocol tests reject version 1 views across every fixture role/phase and retain strict field validation. Live players cannot regain the removed array by supplying extra fields.
- Server and browser implementation owners coordinate version 2 in their owned files; the coordinator's final integrated build/tests provide the complete migration verdict.

## Limits

The 94.30% reduction applies only to this synthetic live player JSON view. It does not imply the same percentage reduction in whole-game traffic, host messages, assets, HTTP/WebSocket framing or provider traffic. No projection CPU figure was collected by this measurement. Whole-game bandwidth, latency, browser recovery and incompatible-client handling at actual ingress are covered by the integrated N08 campaign and server tests.
