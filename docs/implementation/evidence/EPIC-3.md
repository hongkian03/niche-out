# Epic 3 production protocol handoff

Recorded November 14, 2026 in `~/Projects/niche_out`. The user authorized the entire epic with parallel agents and a coordinator. Three contributors owned identity/control/ledger, worker imports, and production application/dispatch. The coordinator integrated the managed launcher, built owner shell, actual-provider protocol client, cross-network checks, independent review and documentation. The [master backlog](../../IMPLEMENTATION-PLAN.md#story-tracker) is the mutable story-status source.

The production backend now completes an actual host-and-two-player game through an application-managed temporary Cloudflare tunnel. Full game screens remain Epic 4. The normal launcher starts the production application; the historical Epic 1 synthetic application remains available only to its separate regression harness.

## Story delivery and evidence

| Story | Implemented and verified |
| --- | --- |
| E3-S01 | Fastify serves exact built shell/asset paths on loopback; 3210–3220 fallback leaves occupied listeners intact. Exact Host/Origin checks, no blanket proxy trust, private-file/forwarded-header negative tests, real public navigation. |
| E3-S02 | Local-only bootstrap minting, public one-use 60-second exchange, Secure/HttpOnly/SameSite cookies, player/host role exclusion, successful-only owner rotation, documented 24-hour rolling credential expiry. Owner recovery preserves the game. |
| E3-S03 | Credential-derived discovery, current membership and last commit, guest/page bounds and expiry, safe page retirement, replacement cleanup. Actual shared-address 256-guest exhaustion preserves admitted players and owner. |
| E3-S04 | Atomic continuation consumption, fresh/loaded/reload/ambiguous paths, explicit takeover, current-generation checks before cached grants, removal/replacement invalidation. Actual Chrome native Duplicate Tab and reversal verified below. |
| E3-S05 | Authenticated polling/WebSocket, per-command checks, 4 KiB raw bounds, 128 pending namespace handshakes and ten-second expiry, current transport binding and clock samples. Real provider polling/upgrade/reconnect passed. |
| E3-S06 | Real engine admission/resume/control binding; an actual 100-member socket scenario rejects player 101 while an existing browser resumes. Same-NAT identities use independent limits. |
| E3-S07 | Fingerprinted outcomes, pinned successes, bounded rejected caches, high-water marks, retired-page handling and replay fences. Final accepted answer retries recover after closure; changed/stale/unauthorized operations cannot reapply. |
| E3-S08 | Owner authorization before raw upload and after body reception; one bounded worker, 10 MiB cap, memory preflight, timeout/termination, private compiled transfer, five-minute candidate, sanitized summary. Real provider exact-limit and over-limit uploads passed. |
| E3-S09 | Explicit generation/candidate-bound commit once; retry after a truly dropped browser response retains the same game and admitted roster. Consumed/stale candidates cannot recreate it. |
| E3-S10 | Server-handler receipt timestamp, host/controller authority, readiness gating, neutral answer acceptance, automatic phase/scoring dispatch. Outages add no grace or pause. |
| E3-S11 | Original-first and fence-first operation resolution, repeated resolution after expiry/generation changes, owner recovery, retired-page results and superseded-game context. Delayed fenced mutations cannot execute. |
| E3-S12 | Schema-checked complete permitted views, finalized scores only, at-most-50 ms readiness batching, immediate critical changes, metadata revisions, no-store responses, numeric-only diagnostics. Real tunnel snapshot sizes recorded below. |
| E3-S13 | Built production listener/worker plus actual Chrome host/players complete import, lost-response commit, admission, owner recovery, removal, two rounds, final recap, takeover and real connector interruption/recovery. A phone completes the same game while the Mac uses eduroam. Fresh-application restart loss is tested. |

## Changed implementation areas

- `apps/server/src/game/application.ts`: production listener, routes, authenticated command dispatcher, scheduler, publisher and cleanup.
- `apps/server/src/game/sessions.ts` and `ledger.ts`: bounded identities/control and reliable operation handling.
- `apps/server/src/game/imports.ts` and `import-worker.ts`: real worker import and staging.
- `apps/server/src/game/hosting-status.ts`, `src/hosting/launch.ts`, `manager.ts`, `owner.ts`, and `src/index.ts`: production lifecycle integration, distinct manager health path, exports and rolling owner expiry.
- `packages/game-core/src/engine.ts`: narrow pure `touchRevision()` hook for server-owned metadata changes. Gameplay rules remain unchanged.
- `apps/web/src/main.tsx`: minimal built owner exchange/status shell; no Epic 4 gameplay screen implementation.
- `tests/server`: actual-listener, session, ledger, import, recovery and restart coverage.
- `probes/game`, `scripts/test-game-server.mjs`, `scripts/measure-game-import.mjs`, package scripts and README/API guides: reproducible protocol demonstration and measurements. `probes/browser.mjs` accepts a visible-browser option for native checks.

[Server integration guide](../../../apps/server/README.md) · [Protocol probe guide](../../../probes/game/README.md)

## Automated evidence

Environment: available Apple M3 Pro with 18 GiB RAM, macOS 26.5.2 arm64, Node **24.22.3**, npm **11.19.1**, Chrome **157.0.8103.51**, pinned cloudflared **2026.11.0**. No permanent domain, provider account or named tunnel was required. There is no Git metadata; the final build manifest records a content-derived source digest.

- Workspace typecheck and all four builds pass.
- Full suite: **298 tests across 23 files**. The seven new server test files contribute 79 tests; existing contracts/core/hosting tests remain included.
- `node tests/fixtures/check-browser-assets.mjs` passes across nine built/served browser files.
- `scripts/test-game-server.mjs` passed twice automatically against actual temporary Cloudflare HTTPS origins. The final completed-build run used `https://ashley-totally-ryan-suits.trycloudflare.com`; earlier coverage used `https://eminem-prizes-bucks-plane.trycloudflare.com`. These were disposable test endpoints and are no longer running.
- The browser intercept deliberately allowed the server to commit and then aborted the response before browser delivery. Replaying the original operation after players joined preserved the original game and roster. Resolution returned APPLIED.
- The provider path accepted a valid exactly-10-MiB upload and rejected 10 MiB plus one byte; malformed input and unauthorized host calls were rejected. The summary contained no answer bank. Requests used real cookies and polling/WebSocket upgrade.
- The owned connector was actually suspended and resumed; manager status changed to Reconnecting then Ready at the same public origin, with Finished results and host authority preserved. Application tests additionally prove deadlines continue while reachability is unavailable during play.
- Three actual clock-sample queries returned the matching sample IDs and finite server times. Initial/resampling browser clock-offset UI belongs to Epic 4.
- Final snapshot JSON measured after receipt through the tunnel: **1,149 bytes for the host** and **1,358 bytes for a player** in the two-round/two-finalist fixture. These are serialized view bytes, excluding Socket.IO/TLS framing and compression, not a 100-player bandwidth benchmark.
- A fresh production application at the same origin/port starts in Setup, rejects the previous owner credential, returns guest discovery for the old cookie and retains no previous game.

## Device and native-browser evidence

The manual production run used `https://navy-inspector-tiny-sublime.trycloudflare.com`. The user was instructed to disable iPhone Wi-Fi, join as Phone, and answer Fall and Amber. The user confirmed reaching Finished tied with Auto on **200 points**, and confirmed the Mac was on **eduroam**. The automatic server-side checks independently observed both winners and matching canonical counts. The previously reported phone version was iOS 27.0.1; no new OS-version assertion or broader device-matrix claim is made.

The user could not locate the isolated Chrome test window. Native computer control was available on this attempt, so the coordinator located the player window through Chrome's Window menu, invoked the actual tab context-menu **Duplicate** action, observed **Tab superseded** in the original player tab, clicked **Take control here**, observed Connected there, and then observed Tab superseded in the duplicate. This was native browser duplication, not a new URL tab or a programmatic popup substitute. The browser version is the test Chrome version recorded above.

No additional manual step remains for this epic. After the checks, the coordinator stopped the held manual test with SIGINT; its normal cleanup closed the temporary browser, server and connector. The two automated sessions cleaned themselves up. No private host links, cookies, continuation tokens, or player answer banks are stored in this report.

## Defects found and resolved during verification

- Early OS timer callbacks could leave a phase without a future wake. The scheduler now rearms even when the monotonic deadline has not yet arrived.
- Hosting/control/import completion changed views without advancing their revision. Those observable metadata changes now advance the shared revision; reads/no-op status updates do not.
- Cached grants could restore an obsolete continuation after later takeovers. Cached control replies now require both current page and generation.
- Retired owner pages needed reconciliation without regaining mutation authority; pinned outcome recovery and superseded-context handling now cover them.
- Upload authorization rotation and failed-body paths could leave a reservation busy; cleanup is now covered by real-route tests.
- Replacement could temporarily exceed the waiting-session bound and retain empty ledger scopes; both are pruned without evicting current participants.
- The architecture-required rolling owner credential expiry was missing from the Epic 1 owner helper; it is now implemented and tested.
- Large test-client writes raced the server's early 413 response, causing EPIPE/ECONNRESET flakes. Route tests now advertise the excessive length and assert the actual early response; full byte-limit behavior is separately tested in the real worker and actual browser/provider path.

The first Chrome test attempt was prevented by the sandbox. The same authorized test was rerun with the access required to launch the isolated browser and completed. No browser security warning was bypassed.

## Reproduce

With Node 24.22.3 selected:

```sh
cd ~/Projects/niche_out
npm run test:server
npm run test:game:tunnel
npm run probe:game
npm run measure:import
```

`test:server` runs local tests after building. The two tunnel commands need installed Chrome, the verified connector and internet; they own separate disposable sessions. `probe:game` supplies the explicit phone/native-browser steps. Normal `npm run host` starts the production backend and minimal authorized host shell, not the full game UI.

## Import measurements and remaining qualification

The reproducible real-worker measurement of a **7,444,743-byte pack**, containing 20 prompts × 1,800 answers with aliases, took **207.75 ms** on this Mac. Peak sampled process RSS was **270,155,776 bytes**, worker heap peak **59,991,344 bytes**, and transfer-stage RSS **270,155,776 bytes**. Process RSS already includes the worker and must not be added to worker heap. Sampling is every five milliseconds plus stage boundaries and is not an exact allocator maximum. The small 897-byte example took 53.00 ms. These measurements support implementation feasibility on this machine; four-target limits and throughput remain later gates.

G3 is complete. Next eligible story is **E4-S01**, awaiting user authorization. Epic 4 owns full browser screens, countdown offset sampling, retry UX and accessibility interactions. Epic 5 owns portable artifacts and actual OS suspension/power/process behavior. Epic 6 owns the full browser/device matrix, measured 100-device throughput, venue/provider qualification and signed release. The available eduroam/cellular check does not certify every eduroam network, event venue, provider limit or target platform.
