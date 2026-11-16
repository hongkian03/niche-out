# Cross Document Development Review

Initial review November 13, 2026; tunnel migration documentation adopted November 14, 2026. Three parallel reviewers assessed the [PRD](PRD.md), [UI/UX](UI-UX.md), and [architecture](ARCHITECTURE.md); the coordinator reconciled their findings and assembled the [development plan](DEVELOPMENT-PLAN.md). The initial review left the source documents unchanged. The follow-up technical clarification now updates the baselines as recorded below; the [example pack](game.example.json) remains unchanged.

The documents describe one coherent product and support a development plan. The November 14 tunnel decision supersedes the original LAN-only deployment assumption. Provider suitability and real venue connectivity remain open evidence gates; the managed-session revision removes required account/domain setup. The reviewed integration ambiguities are now resolved in the documentation. Concrete schemas, browser/platform probes, and verification evidence remain required in the implementation milestones; documented resolution does not mean implemented or tested. Earlier statements that the baselines were ready should be understood as settled product direction, rather than a complete executable protocol specification.

## Shared product and implementation direction

A packaged host process serves bundled assets, owns one in-memory game, and runs timers, validation, scoring and synchronization. A launcher-owned connector automatically allocates one temporary public HTTPS origin per hosting session and forwards to the laptop’s loopback application server. A separate authenticated local setup interface controls hosting and is never forwarded. Up to 100 players join through browsers from any network that permits the endpoint. Host and player interfaces share that public origin. The optional information/download website remains independent.

Game makers supply 1–20 ordered prompts, canonical answers, aliases, manual tiers and points, and shared timing settings. Frequencies describe what this group submitted; they do not determine points. The first accepted answer locks, its assigned outcome stays hidden until reveal, and the server advances phases. Host administration remains Start and Remove Player, alongside setup and presentation actions. Reconnection, explicit tab takeover, removal, replacement, and private versus aggregate recaps follow the already agreed rules.

The documents also agree on TypeScript, React/Vite, Node 24 LTS, Fastify, Socket.IO, Zod, no database, internet-dependent tunnel operation, and four runtime-and-connector-inclusive portable artifacts. Signing and applicable notarization are requirements for the first public downloads. The existing gameplay decisions carry forward. A managed Cloudflare Quick Tunnel is the default session provider candidate. No account or permanent domain is required; service suitability, distribution, venue and capacity evidence remain necessary. Named tunnels are optional future alternatives.

## Findings and proposed resolutions

P1 identified a contract needed before dependent implementation, P2 a consistency/completeness issue, and P3 an ordinary implementation clarification. The findings below describe the initial review; all eight now have documented resolutions in the linked baselines. Closure evidence is future implementation work, not a claim that tests have passed.

| Finding | Documentation status | Remaining evidence or clarification |
| --- | --- | --- |
| R1 Membership discovery | Documented: credential-derived response and resume flow; owner/player conflict refuses conversion. | Implement schemas and discovery/resume tests; tab identity is tracked in R3. |
| R2 Unknown host outcomes | Documented: candidate-bound idempotent commit, two automatic retries, atomic recover-or-fence resolution for uncertain host actions. | Implement and test lost/delayed responses and the adopted retention/fence bounds. |
| R3 Tab identity | Documented: fresh page bootstrap, reconnect reuse, rotated server continuation proof, explicit fallback for stale/ambiguous recovery. | Implement schemas and prove reload/duplicate-tab/lost-reply behavior on real browsers. |
| R4 Deduplication order | Documented: authorize and check fingerprint, recover permitted cache, then validate new operation; fences/high-water marks reject old operations. | Implement deadline/cache/takeover races and changed-payload tests. |
| R5 Import/commit wording | Documented: explicit commit opens Lobby; worker is mandatory. | Implement worker and atomic stage/commit tests. |
| R6 Limits and bounds | Documented: shared schema limits, 256-code-point title, adopted session/page/admission/handshake/cache bounds and non-eviction rules. | Implement and validate limits, cleanup, safe failure, and measured tuning. |
| R7 Reveal wording | Documented: finalized standings may remain visible; host tier catalogue is setup-only. | Inspect actual serialized messages in each phase. |
| R8 Coverage and dialogs | Documented: coverage matrix, dialog focus contract, invitation criterion wording. | Implement shared components and run full acceptance/device/accessibility checks. |

### R1 Initial membership discovery

**P1.** [UI/UX joining](UI-UX.md#player-joining-and-waiting) requires a returning browser to resume without its nickname form. [Architecture session routes](ARCHITECTURE.md#http-routes-and-browser-sessions) only promises a cookie and fresh tab prefix; `game.resume` requires a game ID. The source of that ID after an initial load or reload was unspecified; it is now defined by the discovery contract.

Have the credential-derived session response identify the browser role, current membership/game ID, removal status, and permitted control metadata before resume. It must not create membership, restore identity by nickname, expose a game to an unauthenticated caller, or admit an old credential to a replacement lobby. Specify the host role's precedence separately from participant membership.

**Closure evidence:** reload an admitted player from a bare public join URL, recover the current state without another admission, and verify that cookie loss, removal, and replacement cannot use this path to enter.

### R2 Unknown outcomes for host mutations

**P1.** [UI/UX file confirmation](UI-UX.md#loading-the-game) and [Start behavior](UI-UX.md#assembling-the-room) describe failures preserving the existing lobby. A successful server commit followed by a lost response is an uncertain outcome, not a confirmed failure. [Architecture routes](ARCHITECTURE.md#http-routes-and-browser-sessions) do not explicitly make HTTP game creation idempotent.

Give create/replace a candidate/operation identity and an at-most-once commit result. Retry the same operation or reconcile with session discovery and a snapshot before enabling a new operation. Never interpret a timeout as permission to commit again. Apply equivalent outcome recovery to Start and removal; a repeated removal remains bound to the same player ID. Bound retained results; evicted or expired operations must fail safely rather than execute again.

**Closure evidence:** drop the successful create response, let a player join, then retry; the game ID, code, and roster stay intact. Repeat lost-response checks for Start, replacement, and removal.

### R3 Tab identity across bootstrap and reconnect

**P1.** [Architecture reconnect rules](ARCHITECTURE.md#real-time-protocol-and-reconnects), require controlling reloads to resume and superseded tabs not to steal control automatically. The session route still needs a concrete tab-control mechanism defining how full-page bootstrap, reload, duplicate-tab creation, and automatic socket reconnect differ.

Specify a server-issued tab/view token and controller generation, the metadata retained across reconnect/reload, and how a genuinely new or duplicated tab gets a distinct identity. Any browser storage here stores identity metadata only; unsubmitted answers remain memory-only. Prove the behavior in actual browsers rather than assuming a copied tab-storage value establishes uniqueness. Ownership recovery must not accidentally turn a host browser into an admitted player.

**Closure evidence:** ordinary reload, socket reconnect, duplicated tab, simultaneous tabs, explicit Take control here, and reload of a superseded tab preserve one membership and never create an automatic takeover cycle.

### R4 Deduplication and deadline order

**P2.** [Architecture acknowledgement rules](ARCHITECTURE.md#socket-commands-and-replies), retain outcomes but do not specify lookup order. A retry of the last accepted answer can arrive after that answer closed the round early.

Authenticate and authorize the caller, validate operation identity and payload consistency, and recover an identical permitted cached outcome before testing a new operation against the current phase/deadline. New operations still require strict receipt before the deadline. Reject reuse of a request ID with different content. A removed or superseded actor cannot bypass authorization by replaying an old command. Late replies remain associated with their original game/round on the client.

**Closure evidence:** an accepted retry after early closure recovers its outcome without another mutation; a genuinely new late answer fails. Changed-payload, stale-generation, and evicted-request tests fail safely.

### R5 Import and commit wording

**P2.** [Architecture state transitions](ARCHITECTURE.md#game-state-and-transitions), label Setup to Lobby as valid JSON import. The detailed routes and UI require explicit Create lobby or Replace game after validation. [Resource guidance](ARCHITECTURE.md#limits-and-the-100-player-target), calls the import worker conditional; the adopted contract requires one.

Use the detailed accepted contract: import validates and stages a candidate, explicit commit opens/replaces the lobby, and parsing/indexing runs in an import worker. Correct the older wording when consolidating the specifications in M0. Starting the already committed lobby can invalidate an uncommitted candidate, as already specified.

**Closure evidence:** a validated preview alone never opens or replaces a game, and production import does not invoke the ordinary main-thread JSON parser.

### R6 Complete schema and resource bounds

**P2.** [PRD JSON rules](PRD.md#json-contract), use broad positive-number and nonnegative-integer descriptions. [Architecture resource defaults](ARCHITECTURE.md#import-and-resource-defaults), add safe integers, millisecond-compatible 0.1–600-second durations, and text/byte limits. The initial review found no title bound; the accepted follow-up now adds one. Pre-admission session/tab records also need bounds independent of the 100-player cap.

Implement one schema source with the accepted stricter limits and link authoring help to it. The follow-up accepts a 256-code-point title ceiling after trimming outer whitespace, with a normal field error rather than truncation. The follow-up also specifies bounded waiting sessions, page identities, admission history, unauthenticated handshakes, operation caches, and expiry/rejection semantics in the architecture. Do not add a fixed accepted-answer count: answer data remains variable within the file and measured resource limits.

**Closure evidence:** limit boundaries, unknown nested fields, normalized collisions, safe-total overflow, large title input, session churn, and exhausted import capacity have deterministic, bounded failure paths.

### R7 Reveal boundary wording

**P2.** [PRD round flow](PRD.md#round-flow) says the leaderboard is withheld; [architecture projections](ARCHITECTURE.md#snapshot-and-information-boundaries) permit previously revealed standings. [UI/UX upload summary](UI-UX.md#loading-the-game) also exposes tier names and points to the host before play.

Hide the current round's answer mappings, assigned outcomes, and score changes until Results. Previously finalized totals/standings may remain available. The host-only tier catalogue is setup information; it does not authorize exposing current answer-to-tier mappings. Keep player answer details private to their own view and grouped results free of player attribution. Do not describe that presentation as guaranteed anonymity, since public points can permit inference.

**Closure evidence:** inspect raw responses, acknowledgements, events, and reconnect snapshots in every phase; view filtering must enforce these boundaries before data reaches the browser.

### R8 Acceptance coverage and component details

**P3.** [PRD acceptance criteria](PRD.md#acceptance-criteria) cover 25 functional requirements, while later prose and the 31 [UI/UX criteria](UI-UX.md#design-acceptance-criteria) add recovery, tab takeover, readiness, attribution, search, and lifecycle obligations. Passing the PRD list alone does not complete the release.

Use the plan's coverage matrix across all three sources. Build a shared labelled dialog with focus containment, keyboard dismissal, background blocking, and focus restoration, including a phase-heading fallback if a phase change removes its opener. Narrow UI criterion 3 to correct address/code display wherever invitations are shown; it should not add joining information to every timed screen.

**Closure evidence:** each criterion maps to a milestone and recorded test or review, including keyboard, screen-reader, mobile-keyboard, and projection checks on the implemented interface.

## Accepted recovery follow-up

The follow-up selects automatic recovery for lost create/replace responses: two retries of the same operation, followed by authoritative resolution with conflicting controls disabled. The architecture resolves the delayed-request race using an atomic recover-or-fence operation, rather than assuming an unchanged snapshot proves failure. Consumed candidates and fenced requests never execute again.

Stale or ambiguous tab metadata requires explicit Take control here. The architecture specifies per-document server identities, transport reconnect reuse, server-rotated continuation proof retained as metadata only, and atomic controller generations. A valid controlling reload or ordinary new tab retains automatic behavior; copied/stale proof can require a click. R2–R4 are closed as documentation decisions, with implementation and browser evidence still outstanding.

## Accepted state and resource follow-up

The final clarification adopts complete role-filtered views for both state.snapshot and state.changed, with up to 50 ms coalescing only for readiness emissions. Phase changes, acknowledgements, revocation, and closure are immediate. Base fields now define instance/game/revision/phase identity, zero-based active-round indexing, nullable untimed deadlines, and the shared millisecond clock domain. Incremental state patches are outside the initial protocol. Finished-only recap queries preserve the existing expansion flow without eagerly sending all historical tables on every update.

The adopted metadata defaults are 256 waiting sessions with 10-minute idle expiry, eight registered pages per browser session, 1,000 total successful memberships per game, 128 pending unauthenticated handshakes with a 10-second timeout, and 256 rejected host-operation records with a 2-minute lifetime. Current players are never evicted, successful outcomes required for recovery are retained separately, and retired identities/high-water marks prevent expired cache entries from executing again. The architecture and UI define distinct capacity messages and fresh-lobby recovery at the admission-history limit.

R1–R8 are resolved as documentation decisions. Thresholds remain subject to measured tests, and M0 still requires executable schemas, exact dependency pins, and the planned feasibility demonstrations.

## Feasibility and release gates

These are engineering or publication dependencies, not unanswered product preferences:

| Gate | When to investigate | Required evidence |
| --- | --- | --- |
| Public tunnel origin and browser transport | E1-S11–S14 probes; E1-S15–S20 managed hosting; production protocol in E3-S13 | Loopback binding, exact public/upstream Host and Origin policy, Secure cookies, polling/upgrade and rejected forged forwarding headers. Test host on event Wi-Fi and phone on cellular through the actual provider. |
| Import memory and worker behavior | M0 probe, completed in M2/M6 | Small and near-ceiling valid packs import on each target; timeout and insufficient/unknown headroom fail without replacing the game. Measure parent, worker, and transfer peaks. The adopted multipliers remain hypotheses until measured. |
| Sleep and application lifetime | E1-S17/S19 common lifecycle; packaged/platform completion in M5 | Same-public-origin recovery closes at most one expired phase after OS sleep. Ordinary tunnel outages keep timers running. Public-origin changes require a fresh game, while underlying IP changes may recover. Idle-sleep requests release; launcher closure leaves no server or connector descendants. |
| Public artifact authentication | M0 feasibility, completed in M7 | Testable signing/notarization approach for all four artifacts, including project code/resource coverage, clean-machine launch, and platform-appropriate archive-signature or covered-resource tamper failure. |
| Capacity | Harness starts early; evidence in M6 | Named laptop/uplink/provider plan, reproducible 100-player workload plus host through the tunnel, admission refusal at 101, valid reconnects while full, processing and end-to-end latency, memory, egress and quota headroom, plus actual mixed-network phone evidence. |
| Publisher and project identity | Before M7 publication | Chosen license, publisher identity, signing infrastructure, final naming/artwork as applicable, and notices. Credentials are never included in source or packages. |

## Accepted tunnel migration follow-up

The November 14 managed-session revision adopts one automatically assigned public HTTPS origin for both game roles during each hosting session, loopback-only application binding and a launcher-owned connector. The default temporary setup obtains its endpoint automatically without requiring an operator account, domain or connector command. The maintainer operates no shared room directory or tunnel account for every installation.

The default provider candidate is Cloudflare Quick Tunnel. Its service restrictions, outbound venue connectivity and measured capacity must be assessed before event readiness; a permanent hostname is not an event requirement. Connector bundling preserves the single-installation packaged experience. Direct LAN operation is retained as historical probe evidence, with a selectable release mode deferred.

R1–R8 retain their resolved semantics. Their current implementation evidence must be assessed against the public origin before closing production gates. E1-S11/S12 now supply public invitation/deployment contracts, S14 supplies the pinned connector inventory, and S13 has actual public Chrome evidence. [The managed-hosting handoff](implementation/evidence/EPIC-1-MANAGED.md) records native-tab and connector follow-up results; event/provider capacity remains E6. Historical LAN completion and synthetic public probes do not establish production behavior.

| Finding | Adopted documentation resolution | Required evidence |
| --- | --- | --- |
| R9 Public trust boundary | Separate authenticated local setup listener; loopback public-application upstream, assigned public HTTPS Host/Origin, explicit forwarding policy, Secure public host-only cookies and authenticated roles. | E1-S11/S12/S13/S17/S18/S20 and E3-S01/S02/S05/S13; forged headers, unauthorized host access, cache isolation and actual browser transport. |
| R10 Origin and tunnel lifecycle | Same-origin interruptions preserve the game with timers running. Changed/lost endpoint requires explicit fresh hosting/game session; no silent rotation. Final results keep the tunnel alive until Finish hosting or Quit; browser close preserves hosting. | E1-S15/S16/S17/S19/S20, E4-S11, E5-S01–S05 and E6-S03; connector crash, network switch, sleep, changed hostname and owned-child cleanup. |
| R11 Provider and public resources | Session-owned temporary endpoint without required account/domain, bundled verified connector, bounded public allocation and credential-safe diagnostics. | E1-S14/S16/S20, E3 resource tests and E5/E6 packages; per-target binaries/notices, quota/egress, provider suitability and no leaked secrets. |
| R12 Event qualification | Internet access replaces offline-play acceptance; all runtime assets remain bundled. | E3-S13, E4-S12, E6-S02/S04/S10; actual venue host plus cellular player, full game and measured target traffic. |

Existing room codes remain identifiers and removal excludes a browser identity. Stronger invitation secrets or host approval would be a separately scoped product feature. Provider-edge protection supplements application authorization and bounded allocation. A gateway failure leaves host operations uncertain until the existing atomic resolution completes.

## Review disposition

Proceed with the tunnel migration supplement in the [master backlog](IMPLEMENTATION-PLAN.md), then the amended epic gates. The [migration report](TUNNEL-MIGRATION.md) records the rationale and cross-document impact. Preserve dated LAN measurements and add new tunnel evidence. New documentation does not claim implementation, public publication or measured event capacity. Keep provider suitability, publication identity and venue/device evidence as named external gates. Account/domain credentials are not required for the default temporary hosting path.


## Accepted managed hosting session follow-up

The user approved and the team implemented common managed hosting in E1-S15–S20. The executable deployment schema now accepts event-purpose Quick Tunnels. The reusable manager, authenticated local setup/dashboard, private owner access and synthetic public connection page exist; the full gameplay server and frontend remain later work. See the [managed-hosting handoff](implementation/evidence/EPIC-1-MANAGED.md) for real browser/provider, phone, native-tab and final regression evidence.

Local setup mutations require a per-launch capability plus exact local Host/Origin/method checks; loopback alone never grants authority. Public traffic cannot reach lifecycle or token-minting controls. The public host link uses the existing one-use bootstrap exchange and preserves the rule that an admitted player cannot silently become host. E1 owns the narrow owner-access foundation; E3 reuses it and completes real game/session authorization.

A hosting session persists through final results and has no fixed ten-minute expiry. Finish hosting and Quit are application lifecycle actions, with confirmation when discarding a game/results; they do not introduce a game End/Pause/Skip command. Closing a browser leaves hosting alive. A fresh game in an allowed Lobby/Finished replacement flow gets a new code and membership while it may retain the same hosting endpoint. A lost endpoint or changed URL requires explicit fresh hosting/game state rather than migrating browser credentials or silently rotating invitations.

E1's first link/QR opens a synthetic connection page. Real game-code invitations, admission and the playable flow remain E3/E4. E5 consumes the common manager and launcher, adding packaging, per-OS process ownership and power/suspend behavior. E6 validates provider capacity and the event/browser matrix. Service limits and the development positioning of Quick Tunnels remain suitability concerns, without turning a permanent hostname into a product requirement.

**Closure evidence:** one launch command, Start hosting in local setup, verified public readiness, cellular link/QR access, private host recovery and denied public lifecycle access, same-origin interruption recovery, explicit fresh-session handling after endpoint loss, continued access through Finished, and complete owned-process cleanup. See the master backlog for S15–S20 dependencies and current statuses.
