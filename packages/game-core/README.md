# Deterministic game core

This package implements Epic 2. It contains no listeners, file access, browser APIs, real timers or operating-system clock. Run `npm run test:core` or `npm run demo:core` from the repository root. The demo uses an injected clock and completes immediately without internet access.

## Modules and data boundaries

| Module | Responsibility |
| --- | --- |
| `src/compile.ts` | Validate a pack, compile canonical/alias indexes, reject ambiguous keys, calculate safe score maxima and preserve file order. |
| `src/engine.ts` | Own one committed game, admission/removal, phase transitions, first-answer locks, finalization, totals and retained round records. |
| `src/projections.ts` | Build schema-checked host/player views and Finished-only recap details using explicit field selection. |

`compilePack(unknown)` is the pack validation boundary and throws `PackCompilationError` with field paths on failure. Its frozen result has closure-private lookup maps. Answers receive deterministic internal IDs from prompt/answer positions; the input JSON format is unchanged. Matching uses the shared NFC, whitespace and lowercase rules. Canonical wording, punctuation and explicitly accepted submission text remain intact.

`GameEngine.state()` is a deeply frozen **trusted server snapshot**, containing the private compiled definition, identity bindings and submissions. Never send it, the compiled definition, or compiler transfer data to browsers. Use `projectHost` and `projectPlayer` exclusively for game views. Resolve the player ID from authenticated server membership before calling `projectPlayer`; its context is not a network request schema. There is no API parameter for requesting somebody else's private recap.

## Worker handoff

Epic 3's temporary import worker will parse JSON and call `compilePack`, then send `serializeCompiledPack(compiled)` through its private worker channel. The parent calls `hydrateTrustedCompiledPack` only on that trusted compiler output. Hydration copies/freezes transferred data and rebuilds lookup maps without repeating schema validation, normalization or collision detection. It is deliberately **not** an alternate validation function for browser-supplied data. Parent/worker memory and transfer costs remain part of E3/E6 measurements.

## Engine and server responsibilities

Inject `now`, `newId` and `newGameCode` when constructing `GameEngine`. The clock must be finite and monotonic in milliseconds, in the same domain used for submission receipt times and snapshot samples. ID generator values must be nonempty; the core adds a monotonic occurrence suffix for uniqueness without retaining historical ID sets. The adapter must provide a fresh process identity on restart. Codes must be six digits and differ from the previous committed game's code. Production generators and the suspension-aware clock adapter belong to later server/platform stories.

1. Advance setup generation when starting a new import. Validate/stage outside the engine. Commit the branded compiled candidate against its expected generation; failed or stale commits preserve the existing game. Start invalidates a pending candidate through another generation change.
2. Bind an authenticated browser identity to `admit`; the engine recovers its current membership, keeps nicknames fixed, and enforces active/history limits. Transport disconnection retains the slot; removal excludes that identity until replacement.
3. Call `start` with server-derived hosting readiness and import state. Do not trust these flags from a browser. Start needs at least one player. Live hosting status remains outside scoring and timing.
4. After authoritative changes, inspect `timerToken()`. The server scheduler arranges a wake at its deadline and passes the captured token to `wake`. Tokens include instance, game, round, phase and deadline. Cancel/rearm the external timer when the token changes; stale or duplicate wakes are harmless. The core itself never creates timers. `resumeAfterSuspension` expires at most one phase and gives the next its full duration.
5. Capture complete-command receipt time in the authenticated transport handler and dispatch synchronously. `submit` uses that trusted timestamp; equality with the deadline is late. Invalid answers can be retried, a valid zero-point answer locks, and every eligible player must lock for early completion. Disconnected players remain eligible.
6. Publish permitted views with a clock sample, sanitized hosting status, and the current code's public invitation. Host context includes `importInProgress` for Start/Replace availability. Points/totals become public only after finalization. Finished recap expansion accepts a completed round ID, with private submission wording limited to the authenticated player's own recap.

Authentication, host/player role exclusion, tab control, request IDs and deduplication, acknowledgement replay, rate limits, import lifecycle/timeouts, HTTP/socket error mapping, and actual timer scheduling are **Epic 3** responsibilities. In particular, a retry of the final accepted command after early closure must recover its cached acknowledgement in the server before trying a new core submission. Core method results are internal results, not complete protocol acknowledgements.

Game replacement clears old memberships, submissions and results. The server must invalidate old transport memberships/control and notify reachable clients. The core checks current game IDs on commands; the adapter must never silently supply a replacement game's ID on an old client's behalf.

## Verification boundaries

The core suite covers deterministic rules, capacity invariants, exact deadlines, delayed/stale wakes, one-phase recovery, removal interleavings, schema-valid projections and serialized privacy assertions. The terminal demo runs a two-round game with aliases, rejected retries, a missed answer, accepted zero points, removal, early finish, joint winners and replacement.

These checks do not certify production transport authorization, real-world 100-device throughput, browser gameplay, platform suspend behavior, or public release packaging. Those remain the assigned Epic 3–6 gates.

Epic 3 integration adds `touchRevision()` for observable server-owned metadata changes (hosting readiness, control generation and import completion). It only advances the shared revision; ordinary state/clock reads never call it. Production integration is documented in the [server guide](../../apps/server/README.md).
