# Networking improvements: implementation and verification

Implementation campaign November 17, 2026. This report supplements the retained [baseline](NETWORK-BASELINE.md) and [Singapore run](SINGAPORE-CAPACITY.md). Current scope is 100 players plus host, managed account-free Quick Tunnels. Measurements below are scoped observations, not provider availability guarantees.

## Delivered changes

- **E6-N01:** constant-time engine phase metadata removes full snapshots from diagnostic labels.
- **E6-N02:** synchronous immutable read scopes share one snapshot across recipient projections; live session/control authorization remains per recipient.
- **E6-N03:** join/resume/control/presence metadata shares the 50 ms publication window. Targeted join/recovery state, command acknowledgements, phase transitions and revocations remain immediate. Unchanged resumes avoid a room-wide publication.
- **E6-N04:** protocol 2 removes unused live-player standings; host and revealed standings remain. Contracts, server, browser, probe pages, load clients and fixtures migrate together. See [exact payload experiment](NETWORK-CONTRACT.md).
- **E6-N05:** five application-owned retry waits use half-to-full jitter of the existing backoff schedule.
- **E6-N06:** direct WebSocket opening with polling fallback after network failure/opening timeout, within application retry accounting. Structured authority denials remain distinct.
- **E6-N07:** immediate first clock sample, bounded follow-ups and randomized periodic batches; generation guards and disposal cancel obsolete work.
- **E6-N08:** coordinated regression, browser, capacity and private-package verification; results below.

Implementation areas: [server application](../../../apps/server/src/game/application.ts), [engine](../../../packages/game-core/src/engine.ts), [view contracts](../../../packages/contracts/src/views.ts), [wire contract](../../../packages/contracts/src/wire.ts), [projections](../../../packages/game-core/src/projections.ts), [browser client](../../../apps/web/src/client.ts), [transport adapter](../../../apps/web/src/transport.ts), [browser probe](../../../scripts/load/browser-baseline.mjs).

## Correctness and browser results

- Typecheck and production build passed. Integrated application suite: **450/450 tests across 33 files passed**. Collector/scenario/sanitizer checks: **9/9 passed**. The asset privacy scan checked 15 built/served files.
- Deterministic server tests show one snapshot for a host plus four player recipients, equal snapshot counts in off/light/detailed modes, eight joins sharing one metadata publication, immediate targeted state, unchanged-resume suppression and cancellation on replacement/shutdown.
- Contract regression: a synthetic 100-player Reading message falls from 7,967 to 454 bytes (**94.30% smaller**). This is an individual message comparison, not a full-game traffic reduction.
- Client tests cover bounded retry exhaustion/reset, deterministic ten-client dispersion, slow/stale clock responses, host game replacement and transport fallback.
- Actual Chrome production probe: **8/8 checks passed**: direct WebSocket without initial polling; lost accepted ACK recovery; frozen/preserved offline draft; undelivered answer reconciled without automatic submission; explicit resubmission ends with exact 200/200 scores; authenticated polling after rejected WebSocket; authenticated polling after silently stalled WebSocket; continued periodic clock batches after Finished.
- Responsive layout: **213 checks passed**, including 320–1920 widths, phone landscape, long content, short viewport, touch focus, dialog navigation and reduced motion. The 390-pixel answering screenshot was visually inspected for readable prompt/timer and reachable input/Submit.
- Automated accessibility: **88 audits, zero violations**; color-contrast rules include manual-review items. Emulated layout and axe checks do not replace physical keyboards, VoiceOver or real device zoom.

Logs are under `work/network-improvements/`; retained browser report is linked in the final evidence inventory. No public release or signing operation occurred.

## Problems encountered and resolved

- The first Chrome launch and native process lifecycle tests were blocked by the execution sandbox. Fresh-browser/native checks passed when rerun with the approved execution permissions; the failed attempt logs remain.
- Two takeover tests assumed the old tab had disconnected when the new tab's ACK arrived. They now await the actual disconnect before reconnecting the old tab.
- Independent review caught a host replacement path stopping clock sampling without restarting it. The client now restarts after the new game view; a regression test covers it.
- Initial new server assertions used an invalid hosting status and counted admitted players as all socket recipients. Corrected the test fixtures/expectations; all final tests pass.

## Capacity and package results

Matched runs use the same fixture hashes and retain all historical failures. The owner subsequently confirmed **eduroam** for this campaign, matching the earlier baseline’s network. Original raw reports retain their run-time `unconfirmed` label and hashes; these derived reports record the later confirmation. Hardware remains the available M3 Pro/18 GiB Mac, not the originally proposed 8 GiB reference class. See [compact paired measurements](network-improvements/comparison.json).

| Measurement | Earlier | Updated |
| --- | ---: | ---: |
| Local WebSocket app CPU mean, diagnostics off | 9.17 s | 2.45 s |
| Detailed diagnostic CPU overhead vs off | 29.64% | 2.34% |
| Local polling accepted-answer E2E p95 | 565.5 ms | 203.3 ms |
| Local polling app CPU | 14.72 s | 3.47 s |
| Public mixed accepted-answer E2E p95 | 2,525.5 ms | 719.8 ms |
| Public mixed app CPU | 39.90 s | 11.56 s |
| Public mixed origin egress | 173.92 MiB | 109.15 MiB |
| Public mixed ACK retries | 162 | 0 |
| Public mixed reconnect publications | 200 | 9 |
| Public mixed reconnect recipient attempts | 13,550 | 666 |

Local WebSocket E2E p95 slightly worsened across the six runs (approximately 72–89 ms to 81–93 ms). Reduced CPU does not imply every network percentile improves. Diagnostic overhead uses two repetitions per mode; the public comparison is one run each, not a statistical provider guarantee. Origin bytes exclude outer TLS/QUIC overhead and provider-rejected requests.

The nine-run suite ended with **eight passes and one failure**. Public mixed completed 20 rounds with zero client retries/errors. Public polling completed four verified rounds, then one round-5 answer command exhausted its original attempt plus two retries over about six seconds. The other 99 accepted ACKs returned (stage p95 606 ms); the server recorded 102 accepted handler results including retransmissions and advanced through Results into the next round. All 101 sockets remained present. Failed-stage CPU was 0.537 seconds and maximum event-loop delay 50.66 ms. No client DNS, HTTP 429 or transport error was captured. Individual commands cannot be paired conclusively because diagnostics omit request identities; the exact lost/delayed-ACK boundary remains unisolated. See [polling failure detail](network-improvements/polling-failure.json). Whole-run CPU/traffic comparisons between failures at different rounds would be misleading.

The unchanged Singapore comparison **passed all ten rounds**, all 1,000 unique answers, ten duplicate replays, grouped answer counts and every final score/rank. Zero client ACK retries or transport errors were recorded. Source pack and original timers are unchanged.

| Singapore workload | Earlier | Updated |
| --- | ---: | ---: |
| App CPU time | 127.86 s | 41.53 s |
| App peak RSS | 297.97 MiB | 201.44 MiB |
| Origin TCP egress | 1,152,476,103 bytes | 186,713,884 bytes |
| Accepted-handler p95 | 2.09 ms | 4.91 ms |
| WebSocket accepted-answer E2E p95 | 199.77 ms | 135.86 ms |
| Polling accepted-answer E2E p95 | 498.40 ms | 603.72 ms |
| Maximum stage event-loop delay | 396.62 ms | 60.49 ms |

The handler and polling E2E p95 increased while total CPU and egress decreased; both observations matter. See the [Singapore comparison with raw-report hashes and stage data](network-improvements/singapore-comparison.json). The updated run still passes the declared processing target. Accepted-stage CPU rises from 3.09 seconds in round 1 to 3.89 seconds in round 10, compared with 5.29 to 16.24 seconds previously. Final retained heap remains approximately 27 MiB; this short run is not a long-duration leak certification. Both campaigns used owner-confirmed eduroam; conditions across runs were not controlled, so this is a measured workload comparison, not a universal network guarantee.

The extended browser clock/fallback/recovery probe passed all eight checks. The freshly extracted private **darwin-arm64** archive passed bundled-runtime/native-adapter startup, actual tunnel readiness, browser join/import/two-round play with 200 points, host-browser close and owner recovery, and explicit launcher shutdown. [Package evidence](network-improvements/portable-report.json) includes the archive and source hashes. Previous Mac archive bytes were preserved under `work/network-improvements/previous-package/`. The new archive is `dist-release/Niche-Out-0.1.0-private-darwin-arm64.tar.gz`, SHA-256 `265cf5d1418b0085d95a4216b320d6882be3cd1ee3c171cc4924820b9991473b`. It is private and unsigned; no public distribution or project signing occurred.

E6-N01–N07 are complete. E6-N08 execution/reporting is delivered, but its acceptance remains **REVIEW** because polling-only capacity still fails. The broader E6-S02/S03 and release qualification gates remain open. All owned test processes/tunnels were shut down by their harnesses.

## Remaining qualification

DNS availability, provider limits, actual venue connectivity, physical mobile/assistive-technology behavior, other host platforms and publisher signing remain separate qualification areas. The README's network limitation notice remains applicable. These tests do not establish 200-player capacity or universal polling reliability.

## Evidence inventory

- [Nine-run paired comparison and hashes](network-improvements/comparison.json); raw serial suite: `work/network-improvements/measured/REPORT.md`.
- [Polling failure detail](network-improvements/polling-failure.json).
- [Singapore comparison and hashes](network-improvements/singapore-comparison.json).
- [Actual production browser report](network-improvements/browser-report.json), including periodic sampling and both fallback cases.
- [Layout report](network-improvements/layout-report.json), [accessibility summary](network-improvements/accessibility-report.json), [390-pixel answering screenshot](network-improvements/player-answering-390.png), [320-pixel long results](network-improvements/player-results-long-320.png).
- Full logs and private package execution: `work/network-improvements/`.

## Manual handoff

Use the pinned runtime and run `npm run host` from the repository root, or extract the refreshed Mac archive and use its launcher. Start a new hosting session, open the host page, upload `examples/game.singapore.json`, and join from a phone on cellular via its QR. Check normal answering, rejected-answer retry, refresh/reconnect, and final results. Protocol 2 intentionally rejects old clients; restart hosting and reload pages instead of mixing old running instances with this build. Game-pack JSON remains schema version 1 and does not require editing.

No manual step is required to reproduce the already automated available-Mac checks. Actual event-network/device testing, other host platforms and publisher signing still require their separate inputs. The owner confirmed eduroam after execution. Derived evidence records that confirmation; raw artifacts remain unchanged for hash reproducibility.
