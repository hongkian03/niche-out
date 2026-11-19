# Epic 6 Validation and signed release

Tunnel baseline updated November 14, 2026. Current story status is maintained only in the [master backlog](../IMPLEMENTATION-PLAN.md#story-tracker); these cards define scope and evidence rather than claiming completion.

> **Authorized execution update — November 16, 2026:** The owner authorized Epic 6 now using the available Mac/reference build, with Intel Mac/Windows/Linux execution deferred until after this epic's testing/preparation work. Fresh Chrome smartphone-size layout and accessibility investigation are explicitly required. Emulation is not physical-device certification. Missing publisher credentials and target evidence must remain visible in the report; no public publication is authorized by this request.

> **Networking planning update — November 17, 2026:** The [networking improvement extension](epic-06-network-improvements.md) defines E6-N01–N08: diagnostics calibration, scoped snapshot reuse, publication coalescing, smaller live player views, reconnect jitter, WebSocket-first fallback, clock sampling and matched regression evidence. The owner subsequently authorized implementation; E6-N01–N07 are delivered and N08 evidence is tracked in the [verification report](evidence/NETWORK-IMPROVEMENTS.md). Follow the [master extension tracker](../IMPLEMENTATION-PLAN.md#epic-6-networking-improvement-extension) in sequence, then use N08 evidence to reassess S02/S03 and freeze the next release candidate. Keep Quick Tunnels and 100 players; no provider migration or 200-player expansion is included. Existing physical-device and signing gates still apply.

## npm distribution implementation and release override

The [Epic 5 npm migration](epic-05-npm-distribution.md) now delivers a local, unpublished candidate, four bundled native builds, explicit connector preparation/cache, installed-launcher integration and compatibility tooling. The [npm handoff](evidence/EPIC-5-NPM.md) records available-Mac execution and an installed-package 100-player mixed-transport game. Actual Intel/Windows/Linux and remaining physical lifecycle acceptance stay open; prepared CI is not an executed target pass. The host installs Node `>=24.22.3 <25`; the pinned connector is prepared in a verified user cache on explicit prepare/Start, with no install hooks or source compilation. Final release authentication/provenance tooling and qualification remain Epic 6 work. No registry publication or signed public release has occurred. Original runtime-inclusive archives/cards retain historical evidence; archive-only wording below is superseded by this section.

E6-S01–S05 capacity, recovery, device and accessibility obligations remain. E5-N06 supplies the npm candidate entry gate before final release qualification; its remaining acceptance is visible in the master tracker. Tests of old source/runtime/artifacts do not automatically certify new package paths, native payloads or runtime ranges. The new npm evidence supplements earlier capacity evidence without closing its hardware, physical-network or polling-only qualification gaps. Deferred target execution does not fabricate a platform pass.

| Story | Active npm replacement scope | Required verification |
| --- | --- | --- |
| E6-S06 | Freeze source/lock/native/connector inventory, npm identity/version, supported Node range, notices, MIT metadata and publisher identity. Migrate release planner/audit/candidate schema. | Exact `npm pack` contents/integrity and source-to-package mapping; no private workspace links, tools, secrets or private packs. E5 supplies private assembly/install tooling; E6-S06 now supplies npm metadata, actual-tarball auditing and review planning. Native authentication/publisher execution remains later work. |
| E6-S07 | Authenticate macOS arm64/x64 native prebuilds and validate applicable signing/notarization delivery for npm-installed helpers. The former standalone `.app`/bundled Node container is no longer the deliverable. | Final signed helper hashes, project identity/notarization evidence and actual clean npm-installed native loading/launch on both CPUs. Provenance does not waive OS-native policy. |
| E6-S08 | Authenticate Windows x64 native helper and verify npm application/package inventory. The old standalone EXE sealing bundled Node/JS is superseded by the explicit npm installation trust boundary. | Native signature/timestamp, exact tarball/helper hashes, corrupt-cache/native rejection and Windows 11 npm/PowerShell/Command Prompt startup/cleanup. Node's vendor signature does not authenticate project JS. |
| E6-S09 | Publisher-authenticated npm release checksums/native inventory and provenance, including Linux x64; replace the separate runtime-inclusive Linux archive. | Original/changed package/inventory verification against approved publisher key and registry/provenance mechanisms; actual Ubuntu install/permissions/runtime evidence. |
| E6-S10 | Validate final npm tarball/native payloads on four clean target installations with supported Node already installed. | Global/local/npx, ignore-scripts, native selection, cold/warm prepare cache, failed/offline acquisition, between-session updates and real tunnel gameplay. Downloads are declared setup prerequisites. |
| E6-S11 | Reconcile product/UI/architecture evidence against npm candidate identity. | No obsolete container requirement falsely blocks readiness and no missing native authenticity/target evidence is waived. |
| E6-S12 | Publish reviewed npm version using approved namespace/account, trusted CI/provenance and candidate-to-stable promotion. | Registry readback of exact integrity/version/attestations before separately authorized stable promotion. |

Registry signatures and npm provenance are checked after the explicitly authorized S12 candidate upload, then before stable promotion. Candidate tags are still public distribution. S06–S11 must not require an already published package to pass their local pre-publication gates; they validate exact candidate bytes and configured publisher/provenance capability.

Original IDs/statuses are retained; none becomes Done by changing format. S13 remains optional. Native credentials and publisher identity remain external inputs. Node installation is a host prerequisite, not a player requirement. npm provenance, upstream connector pins, native signatures and runtime execution are distinct evidence.

Pin release-CI Node/npm separately from host runtime requirements and verify publishing/dist-tag support and permissions. Publish the tested tarball without rebuilding it; promote only reviewed versions. If a future split introduces several npm packages, publication is not atomic: verify exact-version components before promoting the main package and retain partial failures. Never overwrite published versions or update an active hosting session.

## S02/S03 follow-up evidence

The owner authorized the targeted follow-up after the networking extension. See [implementation, fixes and retained test results](evidence/EPIC-6-S02-S03-FOLLOWUP.md) for correlated polling investigations, real-runtime bounds, combined 100-player recovery, refreshed imports and longer endurance. The master tracker retains acceptance status; diagnostic and harness delivery does not by itself qualify polling-only capacity or an unavailable 8 GiB host.

## Outcome

Qualify the actual selected temporary-tunnel service under the declared workload, including joining/reconnect bursts, provider limits and the actual venue uplink. A passing E1 phone probe and an ephemeral URL do not establish 100-player capacity. Permanent domains and named-provider accounts are optional, not release prerequisites; if the selected temporary service fails the required workload/reliability checks, resolve that provider decision before claiming event readiness.

Establish measured capacity and usable device behavior, then prepare and verify the promised signed public artifacts.

## Entry and required reading

G5 is complete on the strict linear path. A reference build may be used for capacity investigation earlier only through an explicit replan; do not run another epic in the background by default.

- [Capacity and verification](../ARCHITECTURE.md#verification-before-calling-the-baseline-implemented)
- [Resource and state defaults](../ARCHITECTURE.md#import-and-resource-defaults)
- [Design criteria](../UI-UX.md#design-acceptance-criteria)
- [Signed distribution](../ARCHITECTURE.md#startup-and-release-defaults)

## Story dependencies

The previous epic gate applies in the default linear path. External evidence inputs are defined in the master plan; prepare independent authorized work before treating a missing input as a blocker.

| Story | Size | Direct prerequisites | External inputs |
| --- | --- | --- | --- |
| E6-S01 | 2 | E5-S10 | None |
| E6-S02 | 2 | E6-S01 | X-REFERENCE-HOST, X-TUNNEL-PROVIDER |
| E6-S03 | 2 | E6-S02 | None |
| E6-S04 | 2 | E6-S03 | X-IOS, X-ANDROID, X-DESKTOP-BROWSERS, X-EVENT-NETWORK, X-CELLULAR, X-TUNNEL-PROVIDER |
| E6-S05 | 2 | E6-S04 | X-ACCESSIBILITY-REVIEW |
| E6-S06 | 2 | E6-S05 | X-PROJECT-DECISIONS |
| E6-S07 | 2 | E6-S06 | X-MAC-SIGNING, X-MAC-ARM, X-MAC-INTEL |
| E6-S08 | 2 | E6-S06 | X-WINDOWS-SIGNING, X-WINDOWS |
| E6-S09 | 1 | E6-S06 | X-LINUX-SIGNING, X-LINUX |
| E6-S10 | 2 | E6-S07, E6-S08, E6-S09 | X-MAC-ARM, X-MAC-INTEL, X-WINDOWS, X-LINUX |
| E6-S11 | 1 | E6-S10 | None |
| E6-S12 | 1 | E6-S11 | X-PUBLICATION-AUTH |
| E6-S13 | 2 | E6-S11 | X-SITE-AUTH |

## E6 S01 Reproducible load and metric harness

**Outcome:** Capacity results can be reproduced and interpreted correctly.

**Size:** 2. **Depends on:** E5-S10.

**Planned areas:** Production-server simulated-client harness and workload definitions.

### Work

- Capture tunnel traffic bytes, provider request/connection counts, polling fallback and end-to-end transit separately from handler latency.

- Define normal, synchronized-submit, permitted-invalid-retry, reconnect, and repeated-game workloads for 100 players plus host.
- Capture server handler-to-ack timing, event-loop delay, end-to-end latency, memory, bandwidth, and import measurements separately.
- Record source/runtime/pack/laptop/uplink/provider-plan information and controlled fixture expectations.

### Acceptance

1. The harness exercises the compiled production application rather than an engine-only model.
2. Rate-limited attempts are distinguished from eligible processing latency.
3. The p95 sub-100 ms target has a named workload and measurement boundary, not a generic speed claim.

4. The sub-100 ms processing target excludes internet transit and quota headroom is reported explicitly.

**Verification:** Calibrate counters with a small real-tunnel workload.  A small harness self-check demonstrates correct client identity, expected scoring, sample accounting, and reproducible workload parameters.

## E6 S02 Reference capacity and import measurements

**Outcome:** The 100-player/server target has actual evidence under declared conditions.

**Size:** 2. **Depends on:** E6-S01.

**External evidence or decisions:** X-REFERENCE-HOST, X-TUNNEL-PROVIDER. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Reference workload runs, worker peak measurements, and capacity report.

### Work

- Run the 100-player workload through the chosen provider, including asset delivery, synchronized submission and reconnect bursts.

- Run 100 admitted simulated players plus host, reject a 101st newcomer, and restore an admitted player while full.
- Exercise normal and valid near-ceiling packs with variable answer data, including parent/worker/transfer peaks.
- Measure latency/timing/bandwidth/memory and propose threshold changes only with a recorded specification update.

### Acceptance

1. The report gives actual results and failures for the declared hardware/workload.
2. No admitted player is evicted and duplicate answers do not change manual points under load.
3. A failed latency or memory target remains an open defect and is rerun after its fix; simulation is not advertised as 100 physical devices.

4. Provider plan/limits, measured egress and host uplink are recorded alongside hardware and pack size.

**Verification:** Include polling fallback and projected event usage.  Retain reproducible workload inputs, raw metrics/summary, peak-memory observations, and exact build identity.

## E6 S03 Recovery churn and bounded-state endurance

**Outcome:** Repeated faults/games do not defeat capacity bounds or recovery guarantees.

**Size:** 2. **Depends on:** E6-S02.

**Planned areas:** Fault/churn workloads and bounded-state regression evidence.

### Work

- Inject connector crashes, internet loss, provider failures and public anonymous admission floods.

- Exercise waiting/page/handshake/history/cache limits and expiry under repeated sessions and games.
- Interleave lost/late host responses, resolve fences, stale tabs, removal, restart, and replacement under load.
- Check retained successful outcomes and old-prefix rejection after rejected-cache eviction.

### Acceptance

1. Resource-limit failures preserve current players/committed state and keep counters/storage bounded.
2. An old request never executes as new after cache cleanup, and old games cannot mutate the new game.
3. The report separates measured retained state from expected temporary GC/worker peaks.

4. Active participants survive bounded failures and same-origin reconnect; timers continue while the server is awake.

**Verification:** Measure reconnect storms and retained outcomes through the tunnel.  Deterministic failure injection plus actual runtime churn/retention measurements across repeated complete sessions.

## E6 S04 Event networks and browser device matrix

**Outcome:** The supported player experience is checked beyond browser emulation.

**Size:** 2. **Depends on:** E6-S03.

**External evidence or decisions:** X-IOS, X-ANDROID, X-DESKTOP-BROWSERS, X-EVENT-NETWORK, X-CELLULAR, X-TUNNEL-PROVIDER. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Actual phone/browser/router tests and projection review.

### Work

- Freeze current/previous-major iOS Safari, current Android Chrome, and desktop smoke versions as required by the architecture.
- Test QR/manual join, phone keyboards, resize/rotation, refresh, Wi-Fi loss/rejoin, tabs, deadlines, and host projection.
- Verify public-origin/connector restrictions on the actual event network with a phone on cellular, and document provider/gateway/outbound-port failures.

### Acceptance

1. The report lists actual devices/browser/OS/uplink/provider, results, and missing combinations.
2. Keyboard/Submit/timer and long text remain usable; an emulated viewport is not counted as a physical keyboard/device test.
3. No claim of 100 physical-device Wi-Fi capacity is made from this mixed-device test.

**Verification:** Perform the declared device scenarios, retain steps/screenshots and failures, and rerun affected cases after changes.

## E6 S05 Accessibility and visual completion review

**Outcome:** The implemented UI meets its stated design checks on the final candidate.

**Size:** 2. **Depends on:** E6-S04.

**External evidence or decisions:** X-ACCESSIBILITY-REVIEW. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Semantic interaction, readable layouts, motion, original visual assets, and notices.

### Work

- Review accessible announcements for startup readiness, reconnect, unavailable provider and changed public address.

- Review keyboard-only/dialog/tab/focus behavior and screen-reader phase/error/result announcements.
- Verify 200% text zoom, contrast over composed scenery, reduced motion, long text/large scores, and the viewport matrix.
- Finish original assets/font notices and visual consistency; keep reference screenshots out of runtime.

### Acceptance

1. All owned UI acceptance checks have actual evidence, including zero/miss/tie/empty/full states.
2. No decorative effect blocks input, leaks tier, hides focus, or delays a phase.
3. Unmet checks remain defects or scoped follow-up stories; generating an audit alone does not pass them.

4. Connection errors stay distinct from answer validation and game capacity.

**Verification:** Include keyboard and screen-reader recovery flows.  Record automated findings plus manual keyboard/screen-reader/zoom/motion/visual results; keep fixes bounded using the master split/defect rule.

## E6 S06 Release identity metadata and documentation

Implementation handoff November 18: npm schema 2, exact-tarball auditing, review-only release planning, source provenance and notice assembly are delivered. The [S06 report](evidence/E6-S06-NPM.md) records tests and remaining review. The owner approved `niche-out` but deferred account/organization, publisher identity and artwork/example-rights approval. Existing MIT metadata is reused. No signing, account creation or publication occurred.

**Outcome:** A concrete release candidate has complete metadata and operator instructions.

**Size:** 2. **Depends on:** E6-S05.

**External evidence or decisions:** X-PROJECT-DECISIONS. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Release manifest/notices/license/naming, launch instructions, and signing configuration.

### Work

- Document connector pinning/notices, automatic per-session temporary setup and optional future named-provider configuration, plan limits, TLS termination and credential-safe diagnostics.

- Prepare a reviewable set of license/publisher/product/asset decisions still requiring the project owner.
- Finalize version/platform/source/runtime manifests, checksums, example/format guide, connector setup/public-origin/network troubleshooting, and manual-update instructions.
- Assemble one npm candidate with four native payload targets, frozen source/dependency/connector inventories and no automatic public upload. Prepare review-only sequencing for later native signing and exact-byte publication; retain separate host/contributor/publisher runtime contracts. Keep credentials out of source/packages and verify actual tarball contents.

### Acceptance

1. Owner-required publication decisions are recorded before final artifacts are signed/published.
2. Instructions explain the local server, application-managed temporary tunnel and cross-network joining without a required account/domain, launcher lifetime, owner recovery/conflict, and no restart history.
3. No document claims unmeasured capacity, unsupported platforms, or unverified provider capacity.

4. The release explains actual internet/provider dependencies and avoids unmeasured free or unlimited claims.

**Verification:** Review a fresh operator setup using the final instructions.  Review manifests/package inventory and instructions against the current build; mark the story blocked only after preparing the concrete missing-decision request when inputs are absent.

## E6 S07 macOS signed and notarized outputs

**Outcome:** The two Mac public candidates authenticate the project and support offline signature validation plus internet-dependent public hosting.

**Size:** 2. **Depends on:** E6-S06.

**External evidence or decisions:** X-MAC-SIGNING, X-MAC-ARM, X-MAC-INTEL. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** macOS project signing/notarization/stapling for both CPU artifacts.

### Work

- Include bundled connector and helper resources in the final authenticity and notice review.

- Sign the completed bundle/resources/nested helpers with the approved project identity.
- Notarize and attach the ticket as applicable; preserve runtime notices/manifests.
- Verify both final CPU variants and relevant altered-covered-content failure.

### Acceptance

1. Both arm64 and x64 final candidates have actual signature/notarization evidence.
2. Public readiness does not rely only on the runtime vendor signature or a private unsigned artifact.
3. Missing credentials or target verification remain blockers, not an unsigned-public fallback.

4. Signed output covers the intended connector variant and contains no operator secrets.

**Verification:** Inspect final archive contents.  Record final hashes and signature/notarization/ticket verification with the required clean-target follow-ups; never include private credentials in evidence.

## E6 S08 Windows authenticated project artifact

**Outcome:** The Windows public candidate authenticates and checks project resources.

**Size:** 2. **Depends on:** E6-S06.

**External evidence or decisions:** X-WINDOWS-SIGNING, X-WINDOWS. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Publisher-signed/timestamped Windows launcher and authenticated resource manifest.

### Work

- Include bundled connector and helper resources in the publisher-authenticated manifest.

- Apply the approved project signing/timestamping process to the completed launcher.
- Authenticate the bundled code/resource manifest and verify the launcher rejects altered covered files before execution.
- Preserve portable format and document actual clean-machine behavior without promising absence of reputation prompts.

### Acceptance

1. Project JavaScript/resources are covered by the verification chain.
2. A controlled resource modification fails verification before executing it.
3. The final artifact works without an installer, separately installed runtime, or startup package downloads; tunnel access requires internet.

4. Tampering with a covered connector/resource fails the established verification path.

**Verification:** Include connector integrity checks.  Record signature/resource-verification/tamper evidence on the clean Windows target and final archive hash.

## E6 S09 Linux signed archive and verification

**Outcome:** A Linux download can be verified against the project publisher.

**Size:** 1. **Depends on:** E6-S06.

**External evidence or decisions:** X-LINUX-SIGNING, X-LINUX. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Linux archive signature, checksums, public verification key/fingerprint, and instructions.

### Work

- Include the pinned connector, notices and configuration template in the signed archive.

- Sign the completed Linux archive or provide its detached project signature.
- Document verification key/fingerprint and checksum verification.
- Verify extraction/permissions on the final archive without adding a new Linux runtime verifier.

### Acceptance

1. An altered archive fails the project signature check.
2. The shipped verification material and instructions correspond to the actual final archive.
3. The portable program reports unavailable internet/provider access accurately and starts public hosting when ready.

4. Archive verification covers the actual connector payload and excludes operator credentials.

**Verification:** Inspect final archive contents.  Record valid/modified archive verification and final Ubuntu extraction/launch evidence.

## E6 S10 Final signed artifact clean-target validation

**Outcome:** Release evidence applies to the actual signed/packaged outputs.

**Size:** 2. **Depends on:** E6-S07, E6-S08, E6-S09.

**External evidence or decisions:** X-MAC-ARM, X-MAC-INTEL, X-WINDOWS, X-LINUX. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Final four-artifact evidence and regression selection.

### Work

- Verify managed temporary public access without mandatory account/domain setup, private host authorization and server/connector cleanup on every signed target.

- Extract and run every final artifact independently of development tools, through the real tunnel for required public launch/play, and with internet disabled for explicit unavailable-service feedback.
- Recheck owner recovery, networking, included assets/resources, launcher quit, and platform-appropriate signature/tamper behavior.
- Identify code/packaging changes since capacity/device reports and rerun only affected evidence or tie unchanged code correctly to final packaging.

### Acceptance

1. All four final hashes have clean-target results and no hidden runtime download.
2. Signing/packaging changes cannot inherit an unrelated older test result without review.
3. Any target/signature/public-access failure blocks that promised public release.

4. Each target has actual cross-network evidence tied to the final artifact hash.

**Verification:** Repeat only affected provider/device cases after packaging changes.  Maintain the final source-to-build-to-artifact-to-evidence chain and affected-regression results.

## E6 S11 Release readiness and requirement coverage gate

**Outcome:** The project owner can assess readiness from concrete coverage rather than implementation claims.

**Size:** 1. **Depends on:** E6-S10.

**Planned areas:** Final requirement/evidence index and release-candidate handoff.

### Work

- Map every PRD/UI criterion and architecture/review obligation to exact passing evidence or an explicit blocker.
- Check outstanding defects, platform reports, resource tuning decisions, notices, and publication prerequisites.
- Produce release notes/known limits and the concrete set of artifacts/actions proposed for publication.

### Acceptance

1. All 28 PRD and 35 UI criteria and the additional architecture obligations are accounted for individually.
2. No unresolved mandatory check is relabelled optional to pass the gate.
3. This closes release preparation only; it does not itself upload artifacts or publish a site.

**Verification:** Re-read the baseline/evidence matrix and inspect the final artifact inventory. A separate reviewer is optional; a second agent is not required.

## E6 S12 Publish the authorized release

**Outcome:** Only the reviewed and separately authorized release becomes public.

**Size:** 1. **Depends on:** E6-S11.

**External evidence or decisions:** X-PUBLICATION-AUTH. Prepare independent work first; required evidence must exist before Done.

**Scope:** Publication checkpoint; not required to finish private release preparation.

**Planned areas:** Approved source/release destination, artifact uploads, and public release checks.

### Work

- Confirm the authorized destination and exact release artifacts/source revision from E6-S11.
- Publish that concrete release using the authorized service workflow.
- Verify public names/hashes/signature material/download links against the approved inventory.

### Acceptance

1. Every published item matches the reviewed signed artifact and checksum.
2. Only the approved artifacts are published; no shared relay account, service purchase or additional hosting service is introduced.
3. If publication is not authorized, leave this story unstarted and report the prepared release as private/release-ready.

**Verification:** Check the actual published release/download inventory and links; do not infer authorization from the current planning request.

## E6 S13 Optional static information website

**Outcome:** A public page can explain/download the project without hosting games.

**Size:** 2. **Depends on:** E6-S11.

**External evidence or decisions:** X-SITE-AUTH. Prepare independent work first; required evidence must exist before Done.

**Scope:** Optional; the tunnel-hosted game and signed artifacts do not depend on this site.

**Planned areas:** Static documentation/download information site and its approved deployment.

### Work

- Prepare the hosting explanation, quick-start, format/example links, source/releases, and network troubleshooting.
- Keep gameplay APIs and global code lookup off this information site; document the separately operated tunnel dependency and host-served bundled assets.
- Publish only when the destination and concrete site are authorized; connect real release links after E6-S12 if used.

### Acceptance

1. The site accurately distinguishes downloads/documentation from tunnel-mediated game traffic.
2. Games remain accessible through their operator-owned tunnels when this information site is unavailable.
3. No deployment occurs merely because this optional story appears in the plan.

**Verification:** Review static links/content and actual approved deployment if performed; source/destination decisions remain publication inputs.

## Epic gate

G6 release readiness requires E6-S01 through E6-S11 and all applicable evidence/prerequisites. Actual publication is the separately authorized E6-S12 checkpoint. E6-S13 is optional and does not block the local game. No signing, capacity, device, or accessibility check is passed merely by generating a script/report template.

Record artifacts, actual checks/results, external blockers, and the next eligible story using the master handoff template. A missing target, signature, or authorization is not implied by successful work elsewhere.

