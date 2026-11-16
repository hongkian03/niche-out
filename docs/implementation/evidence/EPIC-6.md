# Epic 6 testing and release-preparation report

November 16, 2026. Work was split between load/stress, browser/accessibility and release agents, with a coordinating integration review, additional import-capacity testing and extracted-package verification. The owner explicitly deferred other host-platform execution until after this work.

**Epic 6's full G6 release gate remains open.** This is a private-candidate testing and preparation handoff, not a public release approval. The game implementation and available-Mac testing are separate from publisher signing, physical-device qualification and clean-target compatibility. The master backlog remains the story-status source.

## Evidence index

| Report | Contents |
| --- | --- |
| [Load and recovery](EPIC-6-LOAD.md) | Production-server workloads, real provider, latency, resource use, throughput, reconnect and churn |
| [Import capacity](EPIC-6-IMPORT.md) | Real worker imports up to exactly 10 MiB, memory boundaries and oversized rejection |
| [UI and accessibility](EPIC-6-UI.md) | Fresh Chrome viewports, axe results, keyboard/reflow checks, screenshots, fixes and remaining manual checks |
| [Release preparation](EPIC-6-RELEASE.md) | Audit tools, notices, signing status and remaining engineering |
| [Provider and transport alternatives](EPIC-6-ALTERNATIVES.md) | Owner-requested investigation, verified provider constraints and proposed small follow-up chunks |
| [Requirement coverage](../../release/REQUIREMENT-EVIDENCE.md) | Individual PRD, UI and architecture requirements with evidence and gaps |
| [Operator guide](../../release/OPERATOR-GUIDE.md) | Extract, launch, host, recover, stop and troubleshoot |
| [Owner decisions](../../release/OWNER-DECISIONS.md) | License, publisher, signing infrastructure and deferred target checks |

## Test environment and interpretation

The available host is a MacBook Pro with Apple M3 Pro (11 cores), 18 GiB RAM, macOS 26.5.2 build 25F84, pinned Node 24.22.3/npm 11.19.1 and cloudflared 2026.11.0. Browser checks use a fresh Chrome 157.0.8103.51 profile. This is not an 8 GiB reference-host certification. Simulated clients on the Mac test the real production protocol but are not 100 physical phones, independent cellular links or a venue's Wi-Fi system.

The owner confirmed **eduroam** as this Mac's uplink for today's tests. Provider workloads leave the Mac through the public Cloudflare endpoint and return to its local server. That exercises the tunnel path but not an independent remote-device network or the future venue. Earlier physical iPhone-over-cellular checks are historical evidence in Epic 4.

Server processing latency ends at acknowledgement enqueue and excludes client queueing and internet transit. Client end-to-end latency is reported separately. Process RSS, live heap after GC, temporary import peaks and provider traffic have different meanings; the linked reports preserve those boundaries. The quiet measurement window avoided active Chrome audits and package compression. The small tunnel calibration briefly overlapped the beginning of local churn and is disclosed in the load report.

Cloudflare documents a 200 **in-flight request** limit for Quick Tunnels, development/testing use and no uptime guarantee. This is not a 200-player limit: polling GET/POST traffic, upgrades and asset loading also consume requests. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Host-side byte/request counters do not expose provider edge-only rejections or outer encrypted transport overhead.

## What changed

- Added a separate-process production load harness under `scripts/load/`, with optional private diagnostic callbacks in `apps/server/src/game/application.ts`. There is no public metrics endpoint and diagnostics contain no answer text, cookies or owner links.
- Added `scripts/test-import-capacity.mjs` for repeatable fresh-process example, representative and ceiling-size imports.
- Expanded the responsive fixture matrix and added `scripts/test-accessibility.mjs`. The audit engine is pinned under developer tooling and is not shipped to players.
- Fixed page landmarks, heading structure, accessible labels, readable game-code output and local launcher readiness/dialog semantics. Removed obsolete launcher copy claiming the game was unavailable. Added a bounded, keyboard-scrollable personal-result text region for extreme answer lengths.
- Added release inventory/planning/connector-dependency tools, six release-tool regression checks, candidate metadata and operator/signing/decision documentation. The release planner intentionally refuses to claim release readiness.
- Added `scripts/test-package-assembly.mjs` to verify the actual extracted four-target archives against checksums, private test signatures, resource inventories and source identity. Operator instructions and release notes now ship inside private packages.
- Added npm commands for load, import capacity, accessibility, release checks and archive verification. No scoring, timer-default or accepted-answer rule was changed.

## What went right

| Verification | Result |
| --- | --- |
| Full application regression | 431 tests in 32 files passed; includes the 107 web tests |
| Packaging unit checks | 4 passed |
| Release-tool checks | 6 passed |
| Workspace types and production build | Passed |
| Browser privacy scan | 15 built/served files checked |
| Responsive layout | 213 cases passed |
| Automated accessibility | 88 axe audits, zero reported violations; manual/incomplete limits remain below |
| Import capacity | All five valid fixtures staged; oversized fixture rejected before worker startup |
| Production dependency advisories | Registry returned zero known advisories; no dependency changes |
| Four private archives | Rebuilt, extracted, signatures/checksums/exact inventories/required guides/Unix executable modes verified |
| Fresh Mac shell launcher | Passed from unrelated cwd with no developer Node on PATH; inherited overrides cleared; clean SIGTERM |
| Fresh extracted Mac browser game | Real tunnel, import, join, two rounds/final 200, host-browser recovery and explicit quit passed |

The final regression log is `work/epic6/regression.log`. The responsive and accessibility counts are different kinds of checks, not additional application unit tests. The last narrow-tab padding adjustment was rechecked by the full layout harness and production build; the preceding axe run covers all semantic and bounded-text changes.

The local 100-player-plus-host workload completed 30 games and 60 rounds with 6,000 unique accepted submissions, 3,000 invalid-answer retries and exact expected totals. A 101st newcomer was rejected without evicting admitted players. Two simultaneous 100-player reconnects preserved identity and control. A 60-second idle heartbeat interval retained all 101 connections. Accepted-answer handler latency was approximately 0.45 ms at p95; this is a processing measurement, not an internet round trip.

The final mixed-provider run completed three 20-round games with 100 players plus host (80 WebSocket players, 20 polling players, WebSocket host). All 6,000 unique accepted submissions and 60 replay acknowledgements produced the correct scores. It had no transport disconnects; three polling acknowledgement timeouts each recovered on one identical retry. Accepted-answer processing p95 was 3.55 ms; accepted-answer end-to-end p95 was 1.546 seconds. A transition reached 404 ms processing time, so the p95 pass is not a claim that every operation is below 100 ms. This run used approximately 403 MiB of upstream HTTP/WebSocket traffic, peaked at 299 MiB server RSS, and retained 27.6 MiB used heap after command measurement samples were cleared and GC ran.

A separate mixed-provider fault run paused the owned connector for three seconds after 50 players had locked their answers. Those locks and all identities/control generations survived, the authoritative clock advanced, and the two-round game finished with the expected 200/20-point totals and shared ranks. No socket dropped during this particular short pause, so it proves short-interruption survival, not a disconnect/resume that did not occur. After closing the old player sockets, 100 simultaneous cold page loads fetched HTML, parallel JS/CSS and the font: all 400 responses were HTTP 200 in approximately 2.04 seconds.

All six import scenarios behaved correctly. The base 897-byte example and 39,600-byte Singapore game staged; both exactly-10-MiB shapes staged; one byte over the ceiling rejected before a worker started. The densest valid fixture peaked at approximately 443 MiB process RSS and 184 MiB worker heap. No resource limit was loosened to make the tests pass.

Fresh Chrome checks cover narrow phones, larger phones, landscape, tablet, desktop and reflow. The UI report records automated and visual checks separately from physical-device and spoken screen-reader evidence.

## Failures and fixes

The initial accessibility run found repeated semantic failures across states: missing/duplicate landmarks, missing or skipped heading levels, invalid element roles and generic labels. Those product defects were fixed and the affected screens rerun. The local dashboard's obsolete game-unavailable wording and unnamed confirmation/QR dialogs were also fixed. Independent screenshot review identified extreme result text obscuring the countdown and tabs; the text region was constrained without truncating its contents or shrinking its font.

Several early failures belonged to the test harness: local HTTP requests needed the configured public Host/Origin, audit injection needed an isolated fixture/CSP-aware context, and import fixture generation initially polluted measured memory. Those harness assumptions were corrected and the affected workloads rerun. The app's production ingress/CSP protections were retained.

Two initial strict public-load runs failed after a polling transport interruption, including one run with no injected outage. The original harness intentionally had no reconnection, so a single lost connection caused its acknowledgement wait to time out. The cause of the observed transport interruption is not established; it is not relabelled as an application or provider defect without evidence. The harness was updated to match bounded client reconnection and same-request retry behavior, and every recovery remained recorded. The clean mixed rerun above does not erase those earlier observations.

The **100-player all-polling workload remains incompletely qualified**. A strict simultaneous reconnect encountered 45 edge HTTP 429 errors before the harness used recovery. The bounded-policy follow-up recorded 43 such errors and restored all identities; its recorded recoveries took at most 2.54 seconds. Later, a Node client DNS lookup returned `ENOTFOUND`. A pending unaccepted request then encountered `STALE_REQUEST` after resume advanced the request fence, and the strict expected-score run stopped. The server still had 100 players and 101 connected sockets. This is not evidence of lost accepted answers or CPU incapacity. The real UI reconciles authoritative state and asks the player to submit again when nothing is locked; silently inventing a new answer request would violate that recovery policy. Nevertheless, a complete successful all-polling game was not measured, and the provider quota pressure is real.

The final integration pass also caught a strict TypeScript error in the new diagnostic close callback. The callback was explicitly typed and restricted to string reason values, then types/build/all regressions passed. This only changes private diagnostic sanitation; measured gameplay logic and browser assets are unchanged.

The signing inventory found no configured Mac publisher identity. More importantly, current private launchers are not yet an authenticated public distribution chain. This is an open release prerequisite, not a passing test or a gameplay regression.

## Remaining issues and limits

- The full-view protocol uses meaningful bandwidth, especially repeated lobby admission. Measured throughput and event projections belong in the load report; the server's low CPU latency does not imply negligible uplink usage.
- All-polling provider qualification remains open as described above. The owner requested a separate provider/transport alternatives investigation; the current provider and game rules were not automatically switched.
- Quick Tunnel startup can take minutes while a fresh hostname becomes reachable. Its provider limits and availability still apply for every hosting session.
- Long titles and large rosters still require ordinary page scrolling. Extremely large scores can wrap. These are readable, bounded-content cases rather than silent truncation; further visual polish can be iterative.
- Automated contrast checks have manual-review/incomplete cases over decorative content. Full VoiceOver/TalkBack spoken flows, physical phone keyboards and every supported browser are not certified by a desktop viewport.
- Current measurements do not establish multi-hour soak behavior, real venue throughput or every possible JSON allocation shape. Retained telemetry can affect harness heap measurements; the load report separates it where measured.
- The combined fault/disconnect/cold-load run recorded a 2.785-second maximum event-loop delay despite an 11.28 ms p95. The exact cause is not isolated; burst fan-out, disconnect processing and instrumentation/GC deserve focused follow-up. A passing processing p95 does not erase this tail-latency concern.
- Public signing still needs engineering as well as credentials: an authenticated Mac launcher/container, Windows native verifier and signing-time resource/connector digest handling. Complete third-party notices and owner source/asset licensing decisions also remain open.
- Intel Mac, Windows and Linux execution, actual sleep/wake/clock changes, clean-machine delivery and final signed-artifact tamper verification remain deferred or unavailable. Cross-built archives do not count as those passes.

## Owner follow-up

The [alternatives investigation](EPIC-6-ALTERNATIVES.md) recommends bounded retry jitter, tested WebSocket-first fallback and reduced/coalesced complete snapshots as small follow-ups. These do not eliminate an all-polling provider cap. Optional host-owned named Cloudflare is the next provider to qualify if account/domain setup is acceptable; its connector can still run only for a game. ngrok and Dev Tunnels add account, quota, entry or production-suitability tradeoffs. No provider or transport policy was changed during this investigation.

Continue private Mac gameplay normally with `npm run host`, or use the refreshed Apple Silicon portable archive. Use the [operator guide](../../release/OPERATOR-GUIDE.md) for the exact flow. For the later cross-platform checks, record the artifact SHA-256, OS/browser version, extract/launch result, public phone join, game completion, owner recovery, sleep/wake and shutdown. The same final signed artifact must eventually receive clean-target verification.

Before public distribution, choose the project license and legal publisher, confirm project asset licensing, arrange the Mac/Windows/Linux signing identities and select a release destination. Keep private keys/passwords out of chat and the repository. The [signing guide](../../release/SIGNING.md) distinguishes remaining development from these owner inputs. There has been no notarization upload, certificate purchase or public publication.

This report is accompanied by raw measurements under `work/` and the extracted archive verification in `dist-release/assembly-verification.json`; retain them when comparing later candidates. A source/build digest identifies the tested tree because this workspace currently has no Git commit identity.

## Refreshed private artifacts

The four archives are in `dist-release/`, with SHA-256 sidecars, refreshed extracted staging folders and operator/release/signing guides. The verifier inspected 3,999 files per Mac/Linux artifact and 3,998 for Windows. The Mac archive was then launched from the newly extracted verification directory, independently of workspace dependencies.

| Target | Archive | SHA-256 |
| --- | --- | --- |
| Mac Apple Silicon | `Niche-Out-0.1.0-private-darwin-arm64.tar.gz` | `a45beaef7c7c2676c0ed558d04586a3fcde5dc04fc94dedc359dab411f781f6f` |
| Mac Intel | `Niche-Out-0.1.0-private-darwin-x64.tar.gz` | `ceb0478db207a714f035d1a91899377512f30760bf9e10f34fd9fdeffbad924e` |
| Windows x64 | `Niche-Out-0.1.0-private-win32-x64.zip` | `904c3a495d9a8306ce93cef1530399f1e17ab99cbf1d9287af2d312126b43b93` |
| Linux x64 | `Niche-Out-0.1.0-private-linux-x64.tar.gz` | `6dfd0d203eec4f92d1363c30c9ab1318534909cf9f917aff9cd62b3523feaef7` |

`dist-release/source-build-manifest.json` preserves the assembly snapshot; later report-only edits do not regenerate or change tested archive bytes. `dist-release/mac-verification.json` binds the available-Mac smoke checks to the new archive hash. It explicitly excludes clean-machine Gatekeeper, physical sleep/wake and publisher signing. Compared with the final load-test compiled-file inventory, only the diagnostic string guard changed; browser assets and the gameplay implementation stayed unchanged. All owned test browsers, servers and connectors were shut down after their checks.
