# Epic 1 Foundations and shared contracts

Tunnel baseline updated November 14, 2026. Current story status is maintained only in the [master backlog](../IMPLEMENTATION-PLAN.md#story-tracker); these cards define scope and evidence rather than claiming completion.

## Outcome

Give subsequent work one pinned toolchain, one set of executable contracts, reproducible fixtures, and early evidence about the risky browser/platform assumptions.

## Entry and required reading

Begin with the earliest eligible story. S01–S10 document the completed LAN foundation; their original probe wording is historical. S11–S14 supply the initial transport contract and evidence; S15–S20 implement the approved managed hosting session. The earlier named-tunnel restriction is historical and is superseded by S15, not silently treated as already changed in code. The [G1 handoff](evidence/EPIC-1.md) records implementation and verification under the subsequent Epic 1 request.

- [Architecture workspace and runtime](../ARCHITECTURE.md#packaging-and-project-structure)
- [Adopted protocol and limits](../ARCHITECTURE.md#implementation-contract)
- [Resolved review](../REVIEW.md)

## Story dependencies

Epic 1 has no previous-epic gate. S01–S10 preserve their historical scope and evidence. The adopted managed-session release requires S11–S20 below. The explicit dependencies below describe the technical prerequisites and optional parallel opportunities.

| Story | Size | Direct prerequisites |
| --- | --- | --- |
| E1-S01 | 1 | None |
| E1-S02 | 2 | E1-S01 |
| E1-S03 | 1 | E1-S01 |
| E1-S04 | 2 | E1-S01 |
| E1-S05 | 2 | E1-S04 |
| E1-S06 | 1 | E1-S02, E1-S03, E1-S04, E1-S05 |
| E1-S07 | 1 | E1-S04, E1-S05 |
| E1-S08 | 2 | E1-S04, E1-S05 |
| E1-S09 | 1 | E1-S02, E1-S06 |
| E1-S10 | 1 | E1-S01, E1-S05 |
| E1-S11 | 2 | E1-S04, E1-S05, E1-S10 |
| E1-S12 | 2 | E1-S11, E1-S04, E1-S05, E1-S06 |
| E1-S13 | 2 | E1-S12 |
| E1-S14 | 1 | E1-S11 |
| E1-S15 | 2 | E1-S11, E1-S12, E1-S14 |
| E1-S16 | 2 | E1-S15 |
| E1-S17 | 2 | E1-S16 |
| E1-S18 | 2 | E1-S17 |
| E1-S19 | 2 | E1-S18 |
| E1-S20 | 2 | E1-S19, E1-S13 |

## E1 S01 Workspace and pinned toolchain

**Outcome:** A contributor can install the chosen versions once and run the agreed build and targeted verification commands.

**Size:** 1. **Depends on:** None.

**Planned areas:** Workspace manifests, lockfile, apps/web, apps/server, packages/contracts, packages/game-core, contributor instructions.

### Work

- Initialize the accepted TypeScript/npm workspace boundaries and pin a supported Node 24 patch and direct dependencies.
- Add compiler/build/test entry points and a source/runtime build-manifest format; record exact versions.
- Keep development dependencies and build activity out of packaged runtime startup.

### Acceptance

1. A clean checkout installs using one lockfile and the recorded runtime, and each workspace builds.
2. The manifest identifies source revision, runtime, and dependency resolution without secrets.
3. No game logic, cloud dependency, database, or deployment is introduced.

**Verification:** Run a clean dependency install, type check, and workspace build; record actual commands and versions. A scaffold does not need a test suite that only mirrors its directory structure.

## E1 S02 Game file shape and numeric limits

**Outcome:** The uploaded file has one strict, shared shape with explicit defaults and bounds.

**Size:** 2. **Depends on:** E1-S01.

**Planned areas:** packages/contracts game-pack schemas and schema/format documentation.

### Work

- Implement root/settings/tier/prompt/answer shape validation and recursively reject unknown fields.
- Apply 1–20 prompts, the 256-code-point trimmed title, text limits, nonnegative safe points, and 0.1–600-second integer-millisecond durations.
- Expose effective defaults and field-path errors; leave canonical/alias index compilation to E2-S01.

### Acceptance

1. The supplied example validates and omitted settings become 3/25/10 seconds and the documented default title.
2. Boundary values, whitespace-only required text, unsafe numbers, unsupported versions, and unknown nested keys produce the expected field errors.
3. No fixed accepted-answer or alias count is added; upload-byte enforcement remains the server's responsibility.

**Verification:** Target schema boundary cases and compare the standalone example with the embedded PRD example; check that frontend consumers do not get a looser validator.

## E1 S03 Deterministic text normalization

**Outcome:** Matching and nickname uniqueness use documented, reproducible text rules.

**Size:** 1. **Depends on:** E1-S01.

**Planned areas:** Pure normalization helpers and their use contracts.

### Work

- Implement NFC normalization, Unicode whitespace trim/collapse, and locale-independent lowercasing for matching keys.
- Separate display/raw wording from comparison keys; preserve punctuation and accents.
- Specify code-point counting and distinct treatment of title trimming versus answer-key normalization.

### Acceptance

1. Case and repeated-space variants generate the same matching key.
2. Punctuation, accents, and non-aliased spellings are not silently converted into different answers.
3. Display text remains available and English-only scope does not become an ASCII-only rejection rule.

**Verification:** Use representative English, accented-name, whitespace, normalization, and punctuation fixtures; demonstrate that fuzzy or compatibility matching is absent.

## E1 S04 Request and outcome contracts

**Outcome:** Every mutation and recovery operation has a concrete validated input/output contract.

**Size:** 2. **Depends on:** E1-S01.

**Planned areas:** packages/contracts HTTP request, command-envelope, acknowledgement, and error schemas.

### Work

- Type the eight socket commands and HTTP bootstrap/import/commit/resolve paths, including instance/game/round/page IDs, generation, and candidate/setup context.
- Define result codes and the operation fingerprint inputs, same-ID retry rules, cancellation fences, and superseded-context responses.
- Separate controller-only mutations from admission/resume/control acquisition so takeover does not require an already-current generation.

### Acceptance

1. Every documented route/command has a schema and an invalid-payload example.
2. Create/replace and operation resolution can represent APPLIED, NOT_APPLIED, and SUPERSEDED without inventing a second creation.
3. No request can establish authority by supplying a player ID, score, deadline, or desired role.

**Verification:** Contract fixtures cover malformed envelopes, wrong versions, changed-payload ID reuse, and required context; no transport or engine implementation is required yet.

## E1 S05 Session and complete view contracts

**Outcome:** Frontend and backend agree on every permitted role/phase view.

**Size:** 2. **Depends on:** E1-S04.

**Planned areas:** packages/contracts discovery, tab-continuation, state, and recap response types.

### Work

- Define discovery fields, role conflict, lastGameCommit, new-page/reconnect metadata, continuation proof, and explicit fallback outcomes.
- Define complete snapshot/change views with shared clock units, nullability, revision/phase identity, and finalized-score fields.
- Define private player results, host aggregate recaps, and Finished-only requested round detail.

### Acceptance

1. Setup/Lobby/Reading/Answering/Results/Finished have valid host/player fixtures where each role is permitted.
2. Before reveal, no player outcome, future prompt, answer mapping, or current-round score leaks through a nominally public field.
3. Both state event types accept the same complete-view schema; no delta reconstruction contract exists.

**Verification:** Validate positive and deliberately leaking fixtures. Check zero-point acceptance, tied ranks, null untimed deadlines, and zero-based active-round indexes.

## E1 S06 Fixtures and deterministic test harness

**Outcome:** Later stories can reproduce game and protocol edge cases without real time or a live network.

**Size:** 1. **Depends on:** E1-S02, E1-S03, E1-S04, E1-S05.

**Planned areas:** Test fixtures, injected clock/ID harness, and example/format help.

### Work

- Prepare a two-prompt normal pack, aliases/zero-point/tie fixtures, invalid packs, and representative long-text/view fixtures.
- Provide a fake clock and deterministic identifiers for core tests; define expected outputs independently of the eventual implementation.
- Keep private pack/response fixtures in test-only areas; only the deliberate public authoring example is downloadable.

### Acceptance

1. Fixtures validate or fail for the explicitly recorded reason.
2. Tests can place receipt exactly before, at, and after a deadline without sleeping.
3. Private fixture answers are excluded from production browser assets.

**Verification:** Run the fixture validation/harness checks and document which later stories own each scenario; do not mark future core behavior as tested.

## E1 S07 Selected LAN origin feasibility probe

**Outcome:** There is early evidence that the selected-origin browser/transport policy can work.

**Size:** 1. **Depends on:** E1-S04, E1-S05.

**Planned areas:** Isolated LAN/browser probe and evidence; no public deployment.

### Work

- Probe selected-IP/port navigation, cookie establishment, polling, and WebSocket upgrade with an available real browser.
- Exercise correct and incorrect Host/Origin/subnet cases, including legitimate navigation/transport requests with different header presence.
- Record the exact environment, observed behavior, and a concrete follow-up for anything not runnable.

### Acceptance

1. The probe never solves a failure by wildcard binding, public relays, or disabling authority checks.
2. The report separates demonstrated behavior, failed assumptions, and unavailable environments.
3. Production integration still has an explicit later verification gate in E3-S13.

**Verification:** Retain reproducible steps and transport/header observations. A NOT RUN report completes only the investigation record; it does not pass the dependent transport-validation gate.

## E1 S08 Tab continuation feasibility probe

**Outcome:** The documented continuation mechanism is exercised before it spreads into product screens.

**Size:** 2. **Depends on:** E1-S04, E1-S05.

**Planned areas:** Browser tab-control probe and reusable scenario fixtures.

### Work

- Probe fresh document IDs, loaded-page reconnect, rotated continuation proof, and single-controller generations.
- Try a normal reload, duplicated controlling tab, duplicated stale tab, lost resume acknowledgement, and explicit takeover.
- Store identifiers/proof only; verify that draft text is not persisted.

### Acceptance

1. Only one page controls a membership after competing transfers.
2. Stale or ambiguous proof yields explicit takeover rather than a silent bootstrap retry.
3. The report names browser versions and which cases are proven, failed, or awaiting a target browser.

**Verification:** Record observable page/generation transitions and retain scenarios for E3-S04/E3-S13. Fix an incompatible mechanism before dependent production control work.

## E1 S09 Import worker and memory feasibility probe

**Outcome:** The file-size, worker, and headroom defaults have an initial measurement rather than an assumed guarantee.

**Size:** 1. **Depends on:** E1-S02, E1-S06.

**Planned areas:** Isolated worker/memory probe and measurement report.

### Work

- Exercise bounded worker parsing/validation using a small and representative large fixture.
- Measure parent/worker/transfer peaks and the supported available-memory/heap-headroom readings.
- Record timeout, insufficient/unknown capacity behavior, and which target environments still need validation.

### Acceptance

1. A failure produces a controlled result without changing a committed-game fixture.
2. The report distinguishes JSON bytes, heap use, native/external allocations, and transfer peaks.
3. No fixed answer-count restriction is introduced to make the probe pass.

**Verification:** Capture build/runtime, input sizes, memory readings, and failure steps. Production compilation and four-target evidence remain E3-S08/E5/E6 work.

## E1 S10 Platform and release feasibility inventory

**Outcome:** Cross-platform lifecycle and signing work has named approaches and known dependencies.

**Size:** 1. **Depends on:** E1-S01, E1-S05.

**Planned areas:** Platform adapter interfaces, feasibility notes, and external-prerequisite register.

### Work

- Define the clock/power/process adapter boundaries without selecting a desktop game framework.
- Investigate an available host's launcher lifetime, suspension timing, idle-sleep request, and shutdown behavior.
- Inventory four artifact targets, test hardware/runners, signing identity/providers, license/naming decisions, and missing inputs.

### Acceptance

1. Every target has an intended packaging/signature/lifecycle approach and a later owner story.
2. Available probes have results; unavailable hardware or credentials are explicitly unverified, not guessed.
3. Missing publication inputs do not block deterministic core development, and no purchase or public release occurs.

**Verification:** Review the inventory against all four architecture targets and map unresolved evidence to E5/E6 external gates.

## E1 S11 Tunnel deployment configuration contract

**Historical applicability:** This completed initial contract required named tunnels for events. S15 explicitly revises that executable restriction and provider assumption for managed temporary hosting; completion of S11 does not claim that revision is implemented.

**Outcome:** One explicit configuration and trust boundary governs public hosting.

**Size:** 2. **Depends on:** E1-S04, E1-S05, E1-S10.

**Planned areas:** Deployment configuration schema and provider setup contract.

### Work

- Define the configured stable HTTPS origin, loopback listener, exact Host/Origin and trusted forwarded-header policy, and Secure cookie behavior.
- Record operator-owned provider/account/domain setup, same public host/player origin, local bootstrap minting and bounded public admission assumptions.
- Define readiness, continuing timers during outages, same-origin recovery and fresh-game public-origin changes; retain existing gameplay limits.

### Acceptance

1. Configuration rejects malformed origins, credentials, fragments and unsupported deployment combinations with field errors.
2. The configured origin is independent of inbound request headers and no loopback peer gains owner authority.
3. Provider plan, domain/account availability, cost and venue connectivity are named pending inputs; Cloudflare named tunnel remains the first candidate until validated.

**Verification:** Validate positive/adversarial config fixtures and review trust/lifecycle tables against the revised baselines.

## E1 S12 Public origin contracts and fixtures

**Outcome:** Shared contracts support the public endpoint without loosening role or data boundaries.

**Size:** 2. **Depends on:** E1-S11, E1-S04, E1-S05, E1-S06.

**Planned areas:** Invitation/view/error schemas and fixture tests.

### Work

- Replace private-IPv4-only invitations with HTTPS DNS-origin shapes and explicit runtime equality requirements.
- Add sanitized readiness/error and public-origin replacement fields only where consumers require them.
- Add wrong-host, unsafe URL, secret leakage, secure-cookie, outage and same-origin recovery fixtures while preserving existing game/pack contracts.

### Acceptance

1. Valid public invitations preserve six-digit leading zeroes and URL/QR consistency.
2. Unknown fields and private credentials remain rejected; schema shape alone never claims provider or hostname ownership.
3. All existing pack/privacy suites and new contract fixtures pass and public-origin expectations are documented.

**Verification:** Run contract, fixture and type/build checks. Behavioral origin authorization belongs to E3.

## E1 S13 Real tunnel feasibility probe

**Outcome:** The intended provider path has actual public-browser feasibility evidence; managed lifecycle integration is verified in S19/S20 and actual event qualification in E6-S04.

**Size:** 2. **Depends on:** E1-S12.

**Planned areas:** Isolated tunnel probe and reproducible browser/network report.

### Work

- Run a synthetic host-owned endpoint on the candidate provider and record provider plan, connector version, hostname lifetime and exact forwarded-header observations.
- Exercise Secure cookies, polling/upgrade, native tab/reload/control cases, upload boundaries, lost replies, wrong Host/Origin and provider non-JSON failures.
- Test the available host uplink and a phone on cellular, and record credential redaction. Retain native-tab and connector-interruption follow-ups explicitly: native Duplicate Tab must close by S20, managed interruption/public-origin transitions by S19/S20, and actual venue qualification by E6-S04.

### Acceptance

1. A real off-network browser completes the probe and maintains the specified session/control behavior.
2. Rejected origin/header/authority cases preserve synthetic committed state; unexpected edge behavior has an explicit production follow-up.
3. PASS, FAIL and NOT RUN are distinguished. Required public transport failures block S20/E3 integration. Actual venue or named-account availability does not block prototype development; event suitability remains an E6 gate.

**Verification:** Retain exact commands, versions, topology, safe header observations and failures. Split into S13-A/B under the parent if provider/browser work exceeds size 2. X-TUNNEL-PROVIDER and X-CELLULAR are external inputs; X-EVENT-NETWORK is retained for E6-S04. S13 may close once its available-network feasibility results and explicit follow-up transfers are reviewed; it does not depend on completion of S19/S20. Native menu duplication and managed interruption are now acceptance obligations of those later stories, preserving coverage without a dependency cycle. This clarification does not automatically mark the existing S13 review complete.

## E1 S14 Tunnel connector platform inventory

**Outcome:** Every target has a bounded connector delivery, credential and cleanup plan.

**Size:** 1. **Depends on:** E1-S11.

**Planned areas:** Connector manifest, platform inventory and lifecycle boundary.

### Work

- Identify pinned connector binaries and integrity/notices for Mac arm64/x64, Windows x64 and Linux x64.
- Specify local credential provisioning, owned-child supervision, bounded backoff, readiness and cleanup alongside the existing power/clock adapters.
- Record actual available-host investigations and missing target/provider inputs, with E5/E6 owners.

### Acceptance

1. The inventory specifies runtime and connector inclusion for each first-release artifact, with pinned binary/integrity sources and no startup package download; E5 owns producing those packages.
2. Real credentials are excluded from source, archives, links and evidence; account/domain costs remain operator setup decisions.
3. Each target has named implementation and verification owners; missing hardware is recorded without claiming certification.

**Verification:** Review inventory against all four artifacts and run available safe lifecycle investigations. E5/E6 own final actual-target proof.

## E1 S15 Session hosting contract

**Outcome:** A temporary public endpoint is an explicit supported hosting-session configuration.

**Size:** 2. **Depends on:** E1-S11, E1-S12, E1-S14.

**Planned areas:** Shared deployment/lifecycle schemas, authoritative documentation, fixtures.

### Work

- Make managed Quick Tunnel hosting the default candidate without requiring an account, domain or permanent hostname; retain exact public-origin and loopback trust rules.
- Define hosting-session identity and states: idle, starting, connecting, ready, reconnecting, failed and stopping. The session spans setup, lobby, play and final results until explicit finish/quit; no fixed ten-minute expiry applies.
- Define same-origin recovery, explicit fresh-session creation after endpoint loss/change, narrow local control/owner handoff, and the interface later game services consume.

### Acceptance

1. The current event-requires-named executable restriction is explicitly replaced and tested; malformed/unsafe origins remain rejected.
2. Hosting lifecycle is distinct from gameplay Start/Remove; application shutdown confirms state loss when a game is active.
3. Provider capacity and event reliability remain unproven until E6; named tunnels are optional future support, not a prerequisite.

**Verification:** Run positive/adversarial contract checks and cross-document review; record the changed runtime contract.

## E1 S16 Reusable tunnel manager

**Outcome:** Application code owns one verified connector and observes actual endpoint readiness.

**Size:** 2. **Depends on:** E1-S15.

**Planned areas:** Reusable server-side tunnel manager, process adapter and status projection.

### Work

- Extract provider/process orchestration from the probe, preserving pinned integrity checks, bounded output, loopback metrics and explicit outgoing connection ownership.
- Discover the temporary origin, validate it and verify the expected session-specific public health response before enabling sharing; bound startup/cancellation and readiness polling.
- Expose sanitized states and disposal hooks; serialize start/stop so stale callbacks cannot affect a newer hosting session.

### Acceptance

1. Repeated Start cannot create multiple live connectors; missing/corrupt binaries and occupied ports fail clearly without killing unrelated processes.
2. URL allocation alone never means Ready; timeout, cancellation and child exit clean up owned resources.
3. The runtime neither downloads dependencies nor adopts the diagnostic probe expiry; no credentials/raw provider logs enter public state.

**Verification:** Use injected process/clock/network cases and an actual available-host startup; assert cleanup and stale-generation fencing.

## E1 S17 Local hosting launcher

**Outcome:** One developer command opens a visible local setup interface with managed Start hosting and shutdown.

**Size:** 2. **Depends on:** E1-S16.

**Planned areas:** Visible launcher, isolated local control listener and setup shell.

### Work

- Run the setup/control interface on a separate loopback listener that the public connector never forwards to; use exact local Host/Origin checks plus a private launcher-issued local capability for mutations.
- Implement Start hosting, cancellation, status and Finish hosting; keep the setup shell reachable when the public endpoint fails. Closing a browser leaves the hosting process running.
- Own orderly shutdown and available-host process cleanup; use a game-lifecycle adapter/fixture for active-game confirmation and state-disposal semantics until E3 integrates the real engine.

### Acceptance

1. A host starts hosting through the UI without invoking cloudflared or configuring a domain; simultaneous actions remain idempotent.
2. Public requests and unauthenticated local/browser requests cannot mutate setup or mint owner access; loopback ingress alone is never authority.
3. Explicit finish/quit stops the public listener and connector; the local setup shell may return to idle after Finish hosting, while launcher quit closes it too.

**Verification:** Test local control authentication, Host/Origin and cross-listener isolation, browser close, cancellation and repeated sessions on the available Mac. E5 owns final OS adapters.

## E1 S18 Hosting dashboard and invitations

**Outcome:** The host can share the verified session URL and privately open its public host page.

**Size:** 2. **Depends on:** E1-S17.

**Planned areas:** Setup dashboard, local QR generation, private bootstrap exchange and connection fixture.

### Work

- Show Connecting/Ready/Reconnecting/Failed with clear recovery actions; provide Copy link/manual fallback and enlarged QR only for a verified current endpoint.
- Implement the narrow private host-access foundation: locally minted one-use expiring bootstrap, public-origin secure session exchange and owner rotation, with no bootstrap secret in QR/public state/logs.
- Use a synthetic public connection page for E1. Keep the real six-digit game-code lobby/admission and player identity integration assigned to E3/E4; expose interfaces for their role-conflict rules.

### Acceptance

1. A cellular phone can scan/copy the link and acknowledge the synthetic connection; the QR exactly matches the currently verified endpoint.
2. Public visitors cannot obtain setup control or owner authority; replay/expired bootstrap and admitted-player role conflicts are covered with fixtures.
3. Private host entry uses the same public origin as players, and locally reopening it does not reset an existing session.

**Verification:** Run actual browser/cellular sharing tests plus expiry, replay, rotation, conflict and secret-redaction tests. E3 extends this same auth foundation to game services.

## E1 S19 Hosting interruption and shutdown

**Outcome:** The running session handles temporary outages and explicit recovery without silently changing its address.

**Size:** 2. **Depends on:** E1-S18.

**Planned areas:** Manager monitoring, lifecycle fencing, recovery UI and cleanup.

### Work

- Monitor actual endpoint health, retain state during same-origin interruption and allow recovery at that origin; game timers continue through the later engine adapter while the host remains awake.
- If the connector exits or the endpoint is irrecoverably lost, enter Failed and stop sharing stale invitations. Offer explicit Start new hosting session with state-loss confirmation; never silently rotate to a new URL.
- Bound shutdown/escalation and reject late callbacks from retired sessions; retain final results until Finish hosting/quit in the real-game integration contract.

### Acceptance

1. A real interrupted connector/network path can recover at the same endpoint where supported; a connector restart producing a new endpoint is correctly classified as a fresh-session case.
2. Fresh-session recovery invalidates prior synthetic state/invitations; no automatic migration or false continuity is claimed.
3. Normal finish, startup failure, cancellation and available-host quit leave no owned connector/listener; forced platform process-tree and suspend behavior remain E5.

**Verification:** Exercise real available-host interruption/recovery and changed-endpoint cases, plus deterministic timeout/cancellation races. Test lifecycle fixtures without claiming a playable game.

## E1 S20 Managed hosting acceptance

**Outcome:** The full Epic 1 managed-hosting flow has reproducible integrated evidence.

**Size:** 2. **Depends on:** E1-S19, E1-S13.

**Planned areas:** Integration scenarios, documentation, manual guide and G1 handoff.

### Work

- Run launcher → Start hosting → readiness → public link/QR → private host page and cellular connection → Finish hosting → new session.
- Close the remaining native Duplicate Tab/control evidence from S13 using the actual browser menu; integrate S19 interruption and fresh-endpoint results.
- Record exact build/provider/browser/device versions, cleanup checks and missing external qualifications. Preserve historic probe evidence and distinguish fixture behavior from production game behavior.

### Acceptance

1. Available-host desktop and real cellular-phone checks pass for connection, upload fixture, refresh, draft clearing, reconnect, QR/link and host-access isolation.
2. Actual native-tab and connector lifecycle checks have outcomes; unresolved defects required by E3 block this gate rather than being hidden by a successful probe.
3. The handbook describes one development launch command, no required account/domain, explicit recovery and shutdown; 100-player, actual venue and four-platform release claims remain gated in E5/E6.

**Verification:** Run the integrated suite and hands-on walkthrough. E3 begins only after this managed-hosting gate and G2; venue access and optional named credentials are not prototype entry requirements.

## Epic gate

Historical S01–S14 evidence remains available. The revised contract gate requires S15 and permits authorized E2 deterministic work. Full managed-hosting G1 requires S16–S20, with S13 transport findings and native-tab follow-ups integrated by S20. E3 requires G2 and S20. Actual event-network/provider capacity qualification remains E6; optional named-account/domain setup is not a prototype gate. Missing target hardware blocks the applicable E5/E6 certification, not available-host development. This plan adds work; it does not mark any new story complete.
