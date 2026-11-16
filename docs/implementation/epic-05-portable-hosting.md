# Epic 5 Portable hosting and machine lifecycle

Tunnel baseline updated November 14, 2026. Current story status is maintained only in the [master backlog](../IMPLEMENTATION-PLAN.md#story-tracker); these cards define scope and evidence rather than claiming completion.

> **Scope update — November 16, 2026:** The user authorized Epic 5 implementation with compatibility testing on the available Mac sufficient for this pass. Actual Windows, Linux and Intel Mac compatibility tests are deferred to the user. Build outputs and source checks must still be reported separately from executed platform tests. This supersedes the all-four-machine prerequisite for this development handoff; it does not certify the deferred platforms or remove final release qualification in Epic 6.

## Outcome

Make the browser game practical to run from a self-contained local host on every promised platform.

## Entry and required reading

G4 functional work is complete. Use the platform approaches investigated in E1-S10 and E1-S14. External hardware gates do not authorize substitutes or reduced platform promises.

- [Platform/runtime matrix](../ARCHITECTURE.md#runtime-and-platform-matrix)
- [Launcher and owner recovery](../ARCHITECTURE.md#launcher-contract-and-owner-recovery)
- [Power/interruption policy](../ARCHITECTURE.md#power-and-interruption-policy)
- [Release defaults](../ARCHITECTURE.md#startup-and-release-defaults)

## Story dependencies

The previous epic gate applies in the default linear path. External evidence inputs are defined in the master plan; prepare independent authorized work before treating a missing input as a blocker.

| Story | Size | Direct prerequisites | External inputs |
| --- | --- | --- | --- |
| E5-S01 | 2 | E4-S12, E1-S10, E1-S14, E1-S20 | None |
| E5-S02 | 2 | E5-S01 | X-MAC-ANY |
| E5-S03 | 2 | E5-S01 | X-WINDOWS |
| E5-S04 | 2 | E5-S01 | X-LINUX |
| E5-S05 | 2 | E5-S02, E5-S03, E5-S04 | None |
| E5-S06 | 2 | E5-S05 | X-MAC-ARM |
| E5-S07 | 2 | E5-S05 | X-MAC-INTEL |
| E5-S08 | 2 | E5-S05 | X-WINDOWS |
| E5-S09 | 2 | E5-S05 | X-LINUX |
| E5-S10 | 1 | E5-S06, E5-S07, E5-S08, E5-S09 | None |

## E5 S01 Packaged launcher integration

**Outcome:** The existing E1 managed launcher and E3/E4 game run from package-relative resources with explicit platform adapter hooks.

**Size:** 2. **Depends on:** E4-S12, E1-S10, E1-S14, E1-S20.

**Planned areas:** Package resource resolution, existing launcher integration, platform adapter interface.

### Work

- Reuse E1-S16–S19 lifecycle, local control authentication, dashboard and private host handoff; wire the complete game without creating a second tunnel manager or owner exchange.
- Resolve bundled runtime, connector, server/web assets and notices relative to the archive; require no startup download/build and no account/domain for the temporary default.
- Connect common power/clock/process ownership hooks and preserve explicit finish/quit, browser-close survival, same-origin recovery and fresh-session endpoint replacement.

### Acceptance

1. Packaged-resource fixtures preserve the E1 behavior, including paths with spaces/non-ASCII characters and actionable missing/corrupt resource errors.
2. Local setup control remains isolated from public ingress, and private bootstrap data remains absent from shared invitations/logs.
3. The game keeps final results available until Finish hosting/quit; OS-specific abrupt exit, suspend and descendant cleanup remain S02–S05 checks.

**Verification:** Integration tests of the existing launcher with package-relative resources and full game; repeat basic lifecycle tests on available hardware. Four-target archives and native closure certification remain their subsequent stories.

## E5 S02 macOS power clock and shutdown adapter

**Outcome:** Supported macOS hosts apply the agreed idle-sleep, suspension, and foreground-process policy.

**Size:** 2. **Depends on:** E5-S01.

**External evidence or decisions:** X-MAC-ANY. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** macOS-specific lifecycle/power/clock helpers.

### Work

- Include the owned connector and its descendants in startup, shutdown and platform evidence; keep any optional provider credentials outside archives and public state.

- Implement the chosen macOS idle-sleep request and release it on finish/quit/failure.
- Connect a tested suspension-aware clock signal to core one-phase recovery without wall-clock drift.
- Ensure terminal/launcher closure ends the server and any helper; prepare helper coverage for both Mac CPU artifacts.

### Acceptance

1. An active game requests idle-sleep prevention while deliberate sleep remains possible.
2. Wake at the same public origin preserves accepted answers and closes at most one expired phase.
3. Clock adjustment and launcher closure cannot produce extended deadlines or orphan helpers.

4. Connector version/integrity/notices are recorded; quit leaves no connector process and no credentials in logs or archives.

**Verification:** Use the actual packaged connector on the target, including missing credentials and blocked outbound connectivity.  Record actual Mac OS/CPU, active sleep/wake, clock-change and close/quit evidence; both final CPU artifacts still need their own clean-target tests.

## E5 S03 Windows power clock and shutdown adapter

**Outcome:** Windows 11 hosting has reliable console ownership, recovery timing, and a project-verifiable launcher.

**Size:** 2. **Depends on:** E5-S01.

**External evidence or decisions:** X-WINDOWS. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Windows lifecycle/power/clock and project-launcher resource verification.

### Work

- Include the owned connector and its descendants in startup, shutdown and platform evidence; keep any optional provider credentials outside archives and public state.

- Implement the selected Windows idle-power request, suspension detection/clock adapter, and console-close cleanup.
- Keep child server/helpers attached to launcher lifetime rather than relying only on a graceful browser action.
- Implement the resource-manifest verification boundary using test signing material as appropriate; public publisher signing is E6-S08.

### Acceptance

1. Closing/quitting the console ends its server without an orphan listener.
2. Resume and wall-clock-change tests satisfy the core interruption policy.
3. Altered resources fail the launcher verification path in the controlled test; a vendor-signed Node binary alone is not treated as project authentication.

4. Connector version/integrity/notices are recorded; quit leaves no connector process and no credentials in logs or archives.

**Verification:** Use the actual packaged connector on the target, including missing credentials and blocked outbound connectivity.  Actual Windows 11 x64 tests for console closure, sleep/wake, idle request release, and controlled manifest tampering.

## E5 S04 Linux power clock and shutdown adapter

**Outcome:** The supported Ubuntu family has explicit, measured host lifecycle behavior.

**Size:** 2. **Depends on:** E5-S01.

**External evidence or decisions:** X-LINUX. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Linux foreground launcher, power helper, and clock adapter.

### Work

- Include the owned connector and its descendants in startup, shutdown and platform evidence; keep any optional provider credentials outside archives and public state.

- Implement the selected Linux idle-sleep inhibition and safe cleanup with an informative unsupported-environment notice.
- Connect suspension-aware timing while keeping ordinary deadlines immune to wall-clock changes.
- Verify terminal-close/quit behavior and package/helper executable permissions.

### Acceptance

1. Supported Ubuntu execution preserves the foreground server lifetime policy.
2. A failed power-request environment warns locally rather than silently claiming sleep protection.
3. Same-public-origin resume and no-orphan closure pass without a tray service or restart recovery file.

4. Connector version/integrity/notices are recorded; quit leaves no connector process and no credentials in logs or archives.

**Verification:** Use the actual packaged connector on the target, including missing credentials and blocked outbound connectivity.  Record the Ubuntu version, kernel/environment, helper behavior, sleep/wake, clock changes, and close/quit results.

## E5 S05 Public origin continuity and interruption integration

**Outcome:** Machine/network interruptions have the exact promised game effect.

**Size:** 2. **Depends on:** E5-S02, E5-S03, E5-S04.

**Planned areas:** Host network monitoring, common clock adapter integration, and recovery messaging.

### Work

- Preserve the game through underlying network/IP changes when the server and public origin survive. A public-origin change ends the old game and requires a fresh lobby/code/invitation.
- Differentiate connector outage/restart, underlying IP change, public-origin replacement, OS suspension and game-process restart.
- Integrate pending operations, stale callbacks, accepted locks, and the next full-duration phase after wake.

### Acceptance

1. Old-origin identities never migrate silently to a new origin or join the fresh game.
2. Wake does not skip unplayed rounds or reopen expired submissions.
3. Recovery retains loopback binding and exact public-origin policy, and old-origin identities never gain new-origin membership.

**Verification:** Cross-adapter application scenarios for same-public-origin return, changed IP, manual sleep, unexpired/expired phase, and a stopped/restarted process.

## E5 S06 macOS Apple Silicon portable artifact

**Outcome:** An Apple Silicon host can extract and run a private self-contained build.

**Size:** 2. **Depends on:** E5-S05.

**External evidence or decisions:** X-MAC-ARM. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** macOS arm64 archive recipe, runtime/resources, and launch instructions.

### Work

- Include the owned connector and its descendants in startup, shutdown and platform evidence; keep any optional provider credentials outside archives and public state.

- Bundle the pinned runtime and connector, compiled server/web/assets, examples, notices, helpers, and visible launcher.
- Preserve executable/resource layout and support paths with spaces/non-ASCII text.
- Produce a private artifact manifest/checksum and test it independently of the development workspace.

### Acceptance

1. A clean supported arm64 Mac needs no separately installed Node or dependency fetch.
2. Public join, gameplay, owner recovery and quit use bundled resources through the configured tunnel; disconnected startup gives an actionable local error.
3. The archive is clearly a private test artifact, not an unsigned public release.

4. Connector version/integrity/notices are recorded; quit leaves no connector process and no credentials in logs or archives.

**Verification:** Use the actual packaged connector on the target, including missing credentials and blocked outbound connectivity.  Clean-machine extraction/launch/game/quit record tied to the artifact hash and actual Mac version/CPU.

## E5 S07 macOS Intel portable artifact

**Outcome:** An Intel Mac can run its correct self-contained build.

**Size:** 2. **Depends on:** E5-S05.

**External evidence or decisions:** X-MAC-INTEL. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** macOS x64 archive recipe and actual Intel validation.

### Work

- Include the owned connector and its descendants in startup, shutdown and platform evidence; keep any optional provider credentials outside archives and public state.

- Build the x64 runtime/helper/resource variant from the same source revision and manifest format.
- Verify CPU-specific binaries and runtime compatibility on an actual supported Intel Mac.
- Retain extraction, public access, recovery, and lifetime evidence independently of arm64 success.

### Acceptance

1. The artifact contains x64-compatible executables and launches without a development Node install.
2. An actual Intel target passes extraction/public play/quit checks.
3. Missing Intel hardware remains unverified; another CPU's result is not substituted.

4. Connector version/integrity/notices are recorded; quit leaves no connector process and no credentials in logs or archives.

**Verification:** Use the actual packaged connector on the target, including missing credentials and blocked outbound connectivity.  Actual Intel Mac clean-target report, package contents, hashes, and full basic host lifecycle smoke.

## E5 S08 Windows portable artifact

**Outcome:** A Windows host can extract and launch without a native installer.

**Size:** 2. **Depends on:** E5-S05.

**External evidence or decisions:** X-WINDOWS. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Windows x64 archive, bundled runtime/project launcher, and instructions.

### Work

- Include the owned connector and its descendants in startup, shutdown and platform evidence; keep any optional provider credentials outside archives and public state.

- Bundle the server/web/runtime/connector/helpers and the project resource-manifest structure.
- Support extraction paths with spaces/non-ASCII characters and a visible console that owns its children.
- Record clean-target outbound connector/network instructions without silently changing the firewall.

### Acceptance

1. No separate Node, compilation, installer, or startup download is needed.
2. Browser close preserves hosting; console close stops it.
3. Public HTTPS join and owner recovery work on a clean Windows 11 x64 environment.

4. Connector version/integrity/notices are recorded; quit leaves no connector process and no credentials in logs or archives.

**Verification:** Use the actual packaged connector on the target, including missing credentials and blocked outbound connectivity.  Artifact-specific clean Windows extraction/public play/resource-integrity/quit checks and checksum report.

## E5 S09 Linux portable artifact

**Outcome:** A supported Ubuntu host can extract and run the package with its bundled connector.

**Size:** 2. **Depends on:** E5-S05.

**External evidence or decisions:** X-LINUX. Prepare independent work first; required evidence must exist before Done.

**Planned areas:** Linux x64 glibc archive, executable permissions, and prerequisites.

### Work

- Include the owned connector and its descendants in startup, shutdown and platform evidence; keep any optional provider credentials outside archives and public state.

- Bundle the runtime, pinned connector and application assets with correct launch/helper permissions.
- Document and test shared-library prerequisites on the supported Ubuntu validation family.
- Keep archive-signature distribution separate from any unrequested Linux runtime verifier.

### Acceptance

1. A clean supported Ubuntu x64 environment runs the package without Node installation or compilation.
2. Permissions survive extraction and package-relative paths work.
3. Public gameplay and launcher/connector shutdown pass using the artifact itself.

4. Connector version/integrity/notices are recorded; quit leaves no connector process and no credentials in logs or archives.

**Verification:** Use the actual packaged connector on the target, including missing credentials and blocked outbound connectivity.  Clean Ubuntu report including versions, dependencies, extraction permissions, hashes, and basic full-game/quit evidence.

## E5 S10 Four-target hosting evidence gate

**Outcome:** The promised host matrix has comparable, traceable results.

**Size:** 1. **Depends on:** E5-S06, E5-S07, E5-S08, E5-S09.

**Planned areas:** Platform evidence index and G5 gap report.

### Work

- Include the owned connector and its descendants in startup, shutdown and platform evidence; keep any optional provider credentials outside archives and public state.

- Consolidate artifact revision/hash/runtime and actual target OS/CPU for each platform.
- Check that owner conflict/recovery, public readiness and internet-loss behavior, sleep/public-origin policy, and no-orphan closure have evidence.
- Rerun affected smoke checks only when packaging or fixes changed the tested build; record remaining blockers.

### Acceptance

1. All four target rows are backed by actual required evidence rather than assumptions.
2. Private-package completion does not claim public signing/notarization or 100 physical-device support.
3. G5 stays incomplete if a promised target's required validation is unavailable or failing.

4. Connector version/integrity/notices are recorded; quit leaves no connector process and no credentials in logs or archives.

**Verification:** Use the actual packaged connector on the target, including missing credentials and blocked outbound connectivity.  Review the four-target evidence matrix and inspect changed build inputs for any necessary repeat checks.

## Epic gate

All four private artifacts have named clean-target evidence, lifecycle/clock/address behavior is proven, and closing the launcher leaves no orphan server/helper. These are private test packages; signed public artifacts and public publication remain E6. If hardware is unavailable, keep the affected evidence blocked and continue eligible independent work inside this epic.

Record artifacts, actual checks/results, external blockers, and the next eligible story using the master handoff template. A missing target, signature, or authorization is not implied by successful work elsewhere.

