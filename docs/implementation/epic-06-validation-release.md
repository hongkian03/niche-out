# Epic 6 validation and npm release

Tunnel baseline updated November 14, 2026. Current story status is maintained only in the [master backlog](../IMPLEMENTATION-PLAN.md#story-tracker); these cards define scope and evidence rather than claiming completion.

> **Authorized execution update — November 16, 2026:** The owner authorized Epic 6 now using the available Mac/reference build, with Intel Mac/Windows/Linux execution deferred until after this epic's testing/preparation work. Fresh Chrome smartphone-size layout and accessibility investigation are explicitly required. Emulation is not physical-device certification. Missing publisher credentials and target evidence must remain visible in the report; no public publication is authorized by this request.

> **Networking planning update — November 17, 2026:** The [networking improvement extension](epic-06-network-improvements.md) defines E6-N01–N08: diagnostics calibration, scoped snapshot reuse, publication coalescing, smaller live player views, reconnect jitter, WebSocket-first fallback, clock sampling and matched regression evidence. The owner subsequently authorized implementation; E6-N01–N07 are delivered and N08 evidence is tracked in the [verification report](evidence/NETWORK-IMPROVEMENTS.md). Follow the [master extension tracker](../IMPLEMENTATION-PLAN.md#epic-6-networking-improvement-extension) in sequence, then use N08 evidence to reassess S02/S03 and freeze the next release candidate. Keep Quick Tunnels and 100 players; no provider migration or 200-player expansion is included. Retain the actual physical-device findings. The November 19 lean-release policy below supersedes the former mandatory signing gates.

## Active lean npm release policy — November 19, 2026

The owner explicitly removed unnecessary pre-release work after reviewing the actual npm architecture. This section supersedes earlier signed-desktop/archive requirements and broad release gates. It does not claim those optional checks passed. See the [lean-release review](evidence/E6-LEAN-RELEASE.md) and the [master tracker](../IMPLEMENTATION-PLAN.md#story-tracker).

One compiled npm CLI contains application/browser assets and four native helper targets. Hosts supply supported Node `>=24.22.3 <25`; explicit prepare/Start obtains the pinned connector into its verified cache. Preserve any platform-required/ad-hoc signatures already emitted by the build; optional publisher signing must not be confused with those runtime requirements. npm installation requires no host compiler, bundled Node or install hooks. No package has been published.

**Required initial-release path:** finish S06 metadata/notices/integrity preparation → S10 exact installed-candidate checks for the declared release scope → S11 readiness/known-limits review → separately authorized S12 npm publication and registry readback. S01–S05 and N08 contribute their existing evidence and unresolved findings; they do not require a fresh exhaustive test campaign merely to repeat unchanged code. New changes or owned failures require affected checks again.

**Optional follow-up:** paid Apple Developer ID/notarization (S07), Windows Authenticode/reputation work (S08), persistent detached publisher signatures (S09), trusted-publishing/provenance automation, a separate candidate-to-stable promotion ceremony and the information website (S13). None blocks this npm release solely because credentials, subscriptions or implementation are absent. Do not execute these actions without a later request. Package integrity, secure account authentication and explicit publication authorization remain required.

The owner deferred Intel/Windows/Linux and broader physical-device/manual testing. An initial release may accurately declare available-Mac evidence while labelling the other bundled targets **unverified**. Do not claim four-platform compatibility, all-polling reliability, 8 GiB-host qualification, 100 physical phones or event-network suitability without their evidence. Platform/native installation failure on a platform actually claimed as validated must be fixed or the claim narrowed before release. OS controls must be respected; do not add blanket security-disable instructions.

| Story | Current scope | Required verification |
| --- | --- | --- |
| E6-S01–S05 | Retain capacity/recovery/device/accessibility evidence, material defects and declared limits | Review existing reports; fix blocking game/privacy/security/recovery/usability defects; repeat affected checks for changed paths. Expanded hardware/browser/venue matrices remain deferred evidence, not automatic initial-release gates |
| E6-S06 | Metadata, notices, source/native/connector/dependency inventory and local npm audit/planner | Exact tarball contents and integrity, complete required notice material, no private workspace links, credentials or private packs; delivered S06 evidence remains factual |
| E6-S07 | Optional Mac publisher signing/notarization | Only if later selected; preserve source/unsigned/signed output hashes and actual target results |
| E6-S08 | Optional Windows publisher signing/timestamping | Only if later selected; actual Windows execution needed for corresponding claims |
| E6-S09 | Optional detached publisher signatures | Only if later selected; npm hashes and pinned component integrity remain required without it |
| E6-S10 | Actual final npm candidate installation within the declared initial-release scope | Exact bytes, ignore-scripts installation, native selection, real worker/assets, connector preparation, hosting/recovery/cleanup; absent targets are labelled unverified |
| E6-S11 | Concise final readiness review | Review material defects, notice completion, exact candidate and known limits; optional signing/automation and owner-deferred matrix coverage cannot falsely block it |
| E6-S12 | One explicitly authorized npm publication | Recheck name/account access, publish reviewed exact bytes and verify registry integrity/version/installation; use provenance if configured, without requiring it to exist before publication |
| E6-S13 | Optional information site | Independently authorized; never a game or npm-release dependency |

The [Epic 5 npm handoff](evidence/EPIC-5-NPM.md) and [notice follow-up](evidence/NOTICE-REVIEW.md) supply installed-Mac, 100-player mixed-transport and notice evidence. Their missing checks remain visible, not silently passed. Source/resource hashes detect corruption; same-directory manifests are not independent publisher authentication. No warning-free macOS/Windows installation claim follows from npm packaging or from tests on the development Mac.

## S02/S03 follow-up evidence

The owner authorized the targeted follow-up after the networking extension. See [implementation, fixes and retained test results](evidence/EPIC-6-S02-S03-FOLLOWUP.md) for correlated polling investigations, real-runtime bounds, combined 100-player recovery, refreshed imports and longer endurance. The master tracker retains acceptance status; diagnostic and harness delivery does not by itself qualify polling-only capacity or an unavailable 8 GiB host.

## Outcome

Qualify the actual selected temporary-tunnel service under the declared workload, including joining/reconnect bursts, provider limits and the actual venue uplink. A passing E1 phone probe and an ephemeral URL do not establish 100-player capacity. Permanent domains and named-provider accounts are optional, not release prerequisites; if the selected temporary service fails the required workload/reliability checks, resolve that provider decision before claiming event readiness.

Establish a usable, integrity-checked npm candidate and an honest release scope. Paid signing, universal matrix qualification and distribution polish are optional follow-up unless the owner later selects them.

## Entry and required reading

G5 is complete on the strict linear path. A reference build may be used for capacity investigation earlier only through an explicit replan; do not run another epic in the background by default.

- [Capacity and verification](../ARCHITECTURE.md#verification-before-calling-the-baseline-implemented)
- [Resource and state defaults](../ARCHITECTURE.md#import-and-resource-defaults)
- [Design criteria](../UI-UX.md#design-acceptance-criteria)
- [Release defaults](../ARCHITECTURE.md#startup-and-release-defaults), interpreted under the active lean policy above

## Story dependencies

G5 is closed by owner instruction. The initial-release critical path is S06 → S10 → S11 → S12; review existing S01–S05/N08 evidence alongside it. Optional S07–S09 and expanded manual matrices do not hold up independent preparation.

| Story | Size | Direct prerequisites | External inputs |
| --- | --- | --- | --- |
| E6-S01 | 2 | E5-S10 | None |
| E6-S02 | 2 | E6-S01 | X-REFERENCE-HOST, X-TUNNEL-PROVIDER |
| E6-S03 | 2 | E6-S02 | None |
| E6-S04 | 2 | E6-S03 | X-IOS, X-ANDROID, X-DESKTOP-BROWSERS, X-EVENT-NETWORK, X-CELLULAR, X-TUNNEL-PROVIDER |
| E6-S05 | 2 | E6-S04 | X-ACCESSIBILITY-REVIEW |
| E6-S06 | 2 | Review existing E6-S01–S05 evidence | X-PROJECT-DECISIONS |
| E6-S07 — optional | 2 | E6-S06; later owner selection | X-MAC-SIGNING, actual target evidence if claimed |
| E6-S08 — optional | 2 | E6-S06; later owner selection | X-WINDOWS-SIGNING, X-WINDOWS |
| E6-S09 — optional | 1 | E6-S06; later owner selection | Approved persistent signing key if selected |
| E6-S10 | 2 | E6-S06 | Actual available-Mac evidence; other targets owner-deferred unless advertised validated |
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
3. Actual failures remain in the report; material game/correctness/resource defects require a fix or an explicitly narrower release claim. Simulation is not advertised as 100 physical devices. Unqualified all-polling/8 GiB/venue conditions remain known limits rather than a mandate for a new investigation before initial release.

4. Provider plan/limits, measured egress and host uplink are recorded alongside hardware and pack size.

**Verification:** Retain polling fallback findings, reproducible inputs, raw summaries, peak-memory observations and exact build identity. Initial release reviews the existing installed-package mixed workload and disclosed limits; expanded hardware/polling/event qualification stays follow-up unless claimed.

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

- Record browser/device versions actually tested and the release scope. The expanded current/previous-major phone and desktop matrix remains owner-deferred; do not invent a pass or advertise it as validated.
- Test QR/manual join, phone keyboards, resize/rotation, refresh, Wi-Fi loss/rejoin, tabs, deadlines, and host projection.
- Retain existing cross-network/phone evidence and provider/gateway/outbound-port failures. Actual venue qualification is an operator/event follow-up; it is required for venue-specific assurances, not for a general limited-scope npm release.

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
- Preserve original-asset/font notices and keep reference screenshots out of runtime. Cosmetic refinements beyond usable, readable interaction are optional follow-up.

### Acceptance

1. Essential keyboard/input/focus/phase/status behavior and readable responsive layouts have evidence for the declared scope, including zero/miss/tie/empty/full states. Expanded assistive-technology/device certification remains an explicit follow-up; essential accessibility defects still require fixes.
2. No decorative effect blocks input, leaks tier, hides focus, or delays a phase.
3. Unmet checks remain defects or scoped follow-up stories; generating an audit alone does not pass them.

4. Connection errors stay distinct from answer validation and game capacity.

**Verification:** Include keyboard and screen-reader recovery flows.  Record automated findings plus manual keyboard/screen-reader/zoom/motion/visual results; keep fixes bounded using the master split/defect rule.

## E6 S06 Release identity metadata and documentation

Implementation handoff November 18: npm schema 2, exact-tarball auditing, review-only release planning, source provenance and notice assembly are delivered. The [S06 report](evidence/E6-S06-NPM.md) records tests and remaining review. Decision update November 19: the owner approved `niche-out`, personal npm account `hongkian03` and publisher display name `Kian Hong Tan`. The owner subsequently approved artwork/example MIT distribution November 19. The [notice follow-up](evidence/NOTICE-REVIEW.md) resolves the missing text and inventories exact connector module/runtime notices; S06 is complete. First publication establishes registry ownership; native identity verification remains separate. Existing MIT metadata is reused. No signing, account creation or publication occurred.

**Outcome:** A concrete release candidate has complete metadata and operator instructions.

**Size:** 2. **Depends on:** Review existing E6-S01–S05 evidence; expanded deferred matrices are not prerequisites.

**External evidence or decisions:** X-PROJECT-DECISIONS. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Release manifest/notices/license/naming, launch instructions, and signing configuration.

### Work

- Document connector pinning/notices, automatic per-session temporary setup and optional future named-provider configuration, plan limits, TLS termination and credential-safe diagnostics.

- Prepare a reviewable set of license/publisher/product/asset decisions still requiring the project owner.
- Finalize version/platform/source/runtime manifests, checksums, example/format guide, connector setup/public-origin/network troubleshooting, and manual-update instructions.
- Assemble one npm candidate with four native payload targets, frozen source/dependency/connector inventories and no automatic public upload. Prepare review-only sequencing for optional native signing and required exact-byte publication checks; retain separate host/contributor/publisher runtime contracts. Keep credentials out of source/packages and verify actual tarball contents.

### Acceptance

1. Owner-required publication decisions are recorded before final artifacts are signed/published.
2. Instructions explain the local server, application-managed temporary tunnel and cross-network joining without a required account/domain, launcher lifetime, owner recovery/conflict, and no restart history.
3. No document claims unmeasured capacity, unsupported platforms, or unverified provider capacity.

4. The release explains actual internet/provider dependencies and avoids unmeasured free or unlimited claims.

**Verification:** Review a fresh operator setup using the final instructions.  Review manifests/package inventory and instructions against the current build; mark the story blocked only after preparing the concrete missing-decision request when inputs are absent.

## E6 S07 macOS signed and notarized outputs

**Scope: Optional future enhancement, outside the initial-release gate.** This stable ID retains the earlier signing work without requiring paid enrollment, a Developer ID certificate, notarization, stapling or a new app/container for the npm release. It is not marked Done merely because it is optional.

**Outcome if selected:** Mac native helper payloads have verified publisher signatures and a demonstrated notarization delivery method compatible with npm.

**Size:** 2. **Depends on:** E6-S06 and a later owner request.

### Optional work and acceptance

1. Prepare explicit staging for `niche-platform.node` and `niche-guard` on both CPU targets; sign using approved credentials without exposing secrets. User-installed Node and unchanged vendor cloudflared are separate components.
2. Demonstrate actual notarization/Gatekeeper behavior; do not promise a stapled npm tarball or warning-free execution. Preserve any OS-required/ad-hoc signatures in the ordinary build regardless of whether this enhancement is selected.
3. Recompute inventories after signing, retain unsigned/signed identities separately, and verify installation and controlled corruption on actual targets before making signing/compatibility claims.

**Verification if selected:** Record exact signed hashes, signature/notary results and actual native loading/hosting/cleanup on each claimed target. Missing optional credentials do not block S10/S11. Ordinary unsigned-by-publisher npm installation is tested under S10 without disabling system security.

## E6 S08 Windows authenticated project artifact

**Scope: Optional future enhancement, outside the initial-release gate.** Paid Authenticode certificates, timestamp services, a standalone bootstrap and reputation-polish work are not npm release prerequisites.

**Outcome if selected:** The Windows native helper carries a verified publisher signature/timestamp with recorded actual Windows behavior.

**Size:** 2. **Depends on:** E6-S06 and a later owner request.

### Optional work and acceptance

1. Apply approved native-helper signing/timestamping without placing secrets in source or packages.
2. Generate inventory hashes after signing and test original/changed helper bytes using actual Windows installation, startup and cleanup.
3. Record actual OS/reputation prompts without promising their absence. No old bundled-Node/JavaScript verifier or desktop installer is required by this npm design.

**Verification if selected:** Actual Windows signature/timestamp/native-loading and corruption evidence. Basic tarball/resource/native/cache integrity remains required under S06/S10 even when this enhancement is skipped.

## E6 S09 Linux signed archive and verification

**Scope: Optional future enhancement, outside the initial-release gate.** The historical Linux archive title/anchor is retained for existing links; the actual optional output is a persistent publisher signature over npm/native release inventories, not another primary runtime-inclusive archive.

**Outcome if selected:** A reviewed publisher key/fingerprint independently authenticates the exact release inventory/tarball.

**Size:** 1. **Depends on:** E6-S06 and a later owner request.

### Optional work and acceptance

1. Select an approved persistent key and safe signing process; no key creation/import or external service enrollment follows from this plan.
2. Sign exact final bytes, publish verification material only when authorized, and demonstrate rejection of a modified copy.
3. Keep npm tarball integrity, component hashes and native-mode checks in the ordinary path. Document that checksums alone are not publisher authentication.

**Verification if selected:** Original/altered inventory checks against the independently trusted key. Missing optional keys/signatures do not block S10/S11.

## E6 S10 Final signed artifact clean-target validation

**Active outcome:** Evidence applies to the exact final **npm candidate** and the initial release's declared validated scope. The historical signed-artifact anchor is retained; paid publisher signing is not required.

**Size:** 2. **Depends on:** E6-S06. Optional S07–S09 are not dependencies.

**External evidence:** Available supported Mac. Intel/Windows/Linux and wider manual testing remain owner-deferred; any corresponding target is labelled unverified until executed.

### Work

- Freeze one candidate's SHA-256/npm integrity, source/lock/resource/native/connector/notice inventories and version. No mutation or rebuild after the reviewed bytes are selected for publication.
- Install those exact bytes outside the checkout with scripts disabled and supported Node already installed. Verify CLI/help, native selection, actual worker/assets/examples, explicit connector acquisition/cache reuse, useful unavailable-service feedback, host recovery and process cleanup.
- Preserve existing real-tunnel/browser/gameplay evidence only when relevant runtime bytes are unchanged; rerun affected cases when they change. Verify private host authorization and no secret/private-fixture leaks.
- Test applicable normal OS controls/permissions. Do not require an installer, app container, bundled Node, blanket Gatekeeper/SmartScreen disabling, or nonexistent offline tunnel hosting. Cold prepare may download the declared verified connector.

### Acceptance

1. The exact candidate installs and its owned functional/integrity checks pass for the advertised validated platform/runtime scope.
2. Required package/resource/native/cache corruption checks fail safely, without treating same-directory hashes as independent publisher identity.
3. Known blocking gameplay/privacy/security/recovery/usability defects within the release claim are fixed or the release scope is explicitly narrowed before review. Absence of optional signing alone is not such a defect.
4. Deferred targets/devices and provider/hardware limits are visible. Four prebuilds or CI configuration do not establish four-platform execution; the initial Mac-qualified release may proceed with honest unverified-target labels.

**Verification:** Retain exact hashes, actual commands/results and a concise changed-versus-unchanged regression selection. Source or artifact changes invalidate the affected freeze and require relevant checks again. No new stress/device matrix is required solely to repeat unchanged code.

## E6 S11 Release readiness and requirement coverage gate

**Outcome:** The project owner can assess readiness from concrete coverage rather than implementation claims.

**Size:** 1. **Depends on:** E6-S10.

**Planned areas:** Final requirement/evidence index and release-candidate handoff.

### Work

- Reconcile the existing criterion/evidence map, identifying release-blocking defects, explicit known limitations, owner-deferred tests and optional follow-ups separately. This authorized policy supersedes the former mandatory paid signing/universal matrix requirements.
- Check outstanding defects, platform reports, resource tuning decisions, notices, and publication prerequisites.
- Produce release notes/known limits and the concrete set of artifacts/actions proposed for publication.

### Acceptance

1. The existing PRD/UI/architecture mapping remains accounted for with actual evidence, known limits or clearly scoped follow-up; no new certification bureaucracy or duplicate report set is required.
2. Material game/privacy/security/recovery/usability and package-integrity failures within the declared release scope are not hidden. Optional paid signing, promotion automation, cosmetic polish and explicitly deferred matrix coverage do not block the initial release.
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
- Verify registry name/version/npm integrity against the approved tarball, then clean-install/run it. Use signatures/provenance if configured; do not require an optional authentication pipeline or two-stage candidate/stable ceremony for one reviewed initial publish.

### Acceptance

1. Every published item matches the reviewed exact npm tarball/version/integrity. Recheck account access and name availability before upload; do not infer ownership of an unpublished name.
2. Only the approved artifacts are published; no shared relay account, service purchase or additional hosting service is introduced.
3. If publication is not authorized, leave this story unstarted and report the prepared release as private/release-ready.

**Verification:** Check the actual published release/download inventory and links; do not infer authorization from the current planning request.

## E6 S13 Optional static information website

**Outcome:** A public page can explain/download the project without hosting games.

**Size:** 2. **Depends on:** E6-S11.

**External evidence or decisions:** X-SITE-AUTH. Prepare independent work first; required evidence must exist before Done.

**Scope:** Optional; the tunnel-hosted game and npm release do not depend on this site.

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

G6 initial-release preparation requires S06's completed metadata/notices/integrity work, S10's exact installed npm candidate evidence for the declared release scope, and S11's review of material defects and existing S01–S05/N08 findings. Optional S07–S09 and S13 are outside this gate. Paid signing, universal platform/device matrices, fresh broad stress campaigns, additional benchmark hardware, venue-specific guarantees, cosmetic polish and a bespoke promotion system are not automatic prerequisites.

Keep the 100-player admission cap and existing network disclaimer. A limited initial release must state actual Mac evidence and label deferred targets unverified. It must not claim all-polling reliability, 8 GiB performance, 100 physical devices or event availability. A material known bug within the promised game/security/recovery behavior is still a release issue; documentation cannot silently turn a false promise into a passing test.

S12 is the separately authorized publication checkpoint. No account enrollment, signing, purchase, upload or site deployment is authorized by revising this plan. Generating a script/report does not establish an executed result. Keep original historical evidence and unresolved findings dated; the owner-approved policy changes scope, not past measurements.
