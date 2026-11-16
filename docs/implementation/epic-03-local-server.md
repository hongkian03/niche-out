# Epic 3 Local server and reliable protocol

Tunnel baseline updated November 14, 2026. Current story status is maintained only in the [master backlog](../IMPLEMENTATION-PLAN.md#story-tracker); these cards define scope and evidence rather than claiming completion.

Implementation evidence: [Epic 3 production protocol handoff](evidence/EPIC-3.md), including per-story verification, actual tunnel/device results and remaining later-epic qualification.

## Outcome

Expose the proven engine through a restricted local production server with robust identities, imports, commands, and recovery.

## Entry and required reading

Entry requires G2 and E1-S20 managed-hosting acceptance. Reuse E1-S16–S19 manager, launcher and narrow owner-access foundation; this epic supplies the real game engine integration, game identities, authorization and protocol. Actual venue qualification remains E6.

- [Network policy](../ARCHITECTURE.md#network-binding-and-reachability)
- [Sessions and discovery](../ARCHITECTURE.md#http-routes-and-browser-sessions)
- [Control continuation](../ARCHITECTURE.md#tab-bootstrap-and-control-continuation)
- [Operation reconciliation](../ARCHITECTURE.md#host-operation-identity-and-reconciliation)

## Story dependencies

All stories inherit the previous epic's gate in the default linear path.

| Story | Size | Direct prerequisites |
| --- | --- | --- |
| E3-S01 | 2 | E2-S09, E1-S20 |
| E3-S02 | 2 | E3-S01, E1-S04, E1-S18 |
| E3-S03 | 2 | E3-S02, E1-S05 |
| E3-S04 | 2 | E3-S03, E1-S08, E1-S13 |
| E3-S05 | 2 | E3-S03, E1-S04, E1-S05 |
| E3-S06 | 2 | E3-S04, E3-S05 |
| E3-S07 | 2 | E3-S05, E3-S06 |
| E3-S08 | 2 | E3-S02, E2-S01, E1-S09 |
| E3-S09 | 2 | E3-S07, E3-S08 |
| E3-S10 | 2 | E3-S07, E3-S09 |
| E3-S11 | 2 | E3-S09, E3-S10 |
| E3-S12 | 2 | E3-S10, E3-S11, E2-S08, E2-S09 |
| E3-S13 | 2 | E3-S12 |

## E3 S01 Restricted production listener and assets

**Outcome:** The local listener serves built assets and health on the selected origin behind the configured public HTTPS tunnel.

**Size:** 2. **Depends on:** E2-S09, E1-S20.

**Planned areas:** apps/server startup, static serving, health, loopback/Host/Origin policy.

### Work

- Attach the real server to the E1 manager lifecycle, preserving its loopback listener selection and validated session origin; replace the synthetic public connection adapter without exposing the separate local control listener.
- Serve the compiled web shell through Fastify, not Vite preview; allow only the intended asset paths.
- Enforce exact configured upstream Host/public Origin policy and bounded envelopes. Trust only documented connector forwarding behavior, never arbitrary forwarded headers or blanket proxy trust.

### Acceptance

1. Correct-origin browser navigation works; invalid hosts, cross-origin mutation attempts, and forged forwarded headers and unauthorized public calls fail as specified.
2. Occupied ports never cause another process to be killed or wildcard exposure.
3. Uploaded packs, private definitions, secrets, and test fixtures cannot be downloaded as static assets.

**Verification:** Actual-listener integration tests plus the real E1-S13 tunnel/browser probe; exercise legitimate navigation/header cases, not only mocked requests.

## E3 S02 Owner authorization and guest sessions

**Outcome:** The local operator has exclusive administrative authority and players remain separate.

**Size:** 2. **Depends on:** E3-S01, E1-S04, E1-S18.

**Planned areas:** Server session/cookie manager and owner exchange/recovery.

### Work

- Reuse the E1-S18 owner-exchange/session foundation and extend its bounded public operations to real host/game authorization; mint bootstrap links only through authenticated local launcher control.

- Reuse and verify the existing one-use 60-second owner bootstrap and cookie policy; implement the full guest/player session ledger and game-scoped access checks.
- Integrate existing local token minting and successful owner rotation with real game lifetime; preserve the E1 rule that an unused link revokes no authority.
- Refuse owner conversion in an admitted player browser with HOST_PLAYER_CONFLICT; preserve its player state and direct recovery to another browser context.

### Acceptance

1. Only a valid owner can invoke administrative services; active host browsers cannot join as players.
2. Recovery preserves games/players, revokes prior owner credentials only on success, and never consumes a refused role-conflicting link.
3. Secrets do not appear in logs, public invitations, or ordinary responses; Secure, HttpOnly, SameSite=Strict host-only cookies match the public HTTPS origin.

4. Public callers gain no authority from loopback ingress or claimed proxy headers.

**Verification:** Test replay, public abuse bounds and provider caching/log redaction.  Authentication, expiry, one-use, conflict, rotation, and redaction tests against the real exchange route.

## E3 S03 Discovery and bounded page registration

**Outcome:** A page discovers its role and existing game before admission/resume without inventing membership.

**Size:** 2. **Depends on:** E3-S02, E1-S05.

**Planned areas:** POST /api/session, own-membership lookup, page registry, and expiry.

### Work

- Exercise anonymous traffic and shared-campus/carrier NAT without assuming each player has a unique IP.

- Return permitted discovery fields and host lastGameCommit context; a guest gets no other game's secrets or roster.
- Implement 256 waiting sessions/10-minute idle expiry and eight registered pages per browser, with safe inactive-page retirement.
- Keep current host/admitted sessions outside guest eviction and handle expired/removed/replaced membership explicitly.

### Acceptance

1. A bare join URL can recover an admitted identity's game ID without nickname entry.
2. Old cookies alone do not join a replacement game; removed sessions receive terminal status.
3. Resource exhaustion preserves active participants and returns distinct recoverable capacity errors.

4. New unauthenticated traffic cannot evict admitted players or the host.

**Verification:** Include shared-NAT and guest-exhaustion cases.  Discovery fixtures and expiry/capacity tests with actual cookies; use injected short lifetimes for tests while separately asserting production defaults.

## E3 S04 Controller continuation service

**Outcome:** The production control service enforces the agreed new-tab, reload, reconnect, and explicit fallback behavior.

**Size:** 2. **Depends on:** E3-S03, E1-S08, E1-S13.

**Planned areas:** Server page-control leases, continuation tokens, and generation rules.

### Work

- Repeat continuation and native tab scenarios through the public HTTPS origin and connector reconnect.

- Bind/rotate proof to session/game/controller/generation; reuse loaded-page identity on transport reconnect.
- Implement atomic valid-proof transfer, current-controller resume, and explicit claim without requiring the old generation to be current.
- Retire invalid identities safely and prevent stale/copied/ambiguous proof from silently retrying as a new tab.

### Acceptance

1. Concurrent copies cannot both consume one continuation; at most one generation controls play.
2. A stale reload requires Take control here; an ordinary new tab and valid controlling reload retain automatic behavior.
3. No stored control metadata contains answer text, and removal/replacement/expiry invalidate the relevant proofs.

4. Same-origin reconnect preserves identity; public-origin replacement requires fresh admission.

**Verification:** Run E1-S13 scenarios through the production control service.  Promote E1 scenarios into service tests, including lost successful resume replies and races with removal/replacement.

## E3 S05 Authenticated socket transport and clock samples

**Outcome:** The transport validates sessions, versions, roles, and bounded frames before dispatch.

**Size:** 2. **Depends on:** E3-S03, E1-S04, E1-S05.

**Planned areas:** Socket.IO handshake, dispatcher, state.get, and clock.sample.

### Work

- Verify provider TLS termination, cookie forwarding, polling, upgrade, idle disconnect and raw frame limits on the actual tunnel.

- Attach Socket.IO to the production listener with polling/upgrade support and per-command authorization.
- Bound unauthenticated handshakes at 128 with a 10-second timeout and enforce one current transport per registered page.
- Implement read-only snapshot/clock queries and three initial samples plus 30-second refresh support; do not let reads advance mutation high-water marks.

### Acceptance

1. Malformed/oversize/incompatible commands fail without engine mutation.
2. Guest/removed/superseded callers cannot obtain authority through a handshake or read request.
3. Correct-origin polling and WebSocket upgrade both work while admission/host connections survive pending-handshake exhaustion.

4. All browser traffic uses the configured HTTPS/WSS origin and no proxy metadata bypasses authorization.

**Verification:** Record real provider header and reconnect observations.  Transport integration tests and actual-browser polling/upgrade checks, including authentication timeout and clock-domain fixtures.

## E3 S06 Admission and control commands

**Outcome:** Sockets connect browser identity to the existing core membership and controller service.

**Size:** 2. **Depends on:** E3-S04, E3-S05.

**Planned areas:** game.join, game.resume, and player.claimControl handlers.

### Work

- Map joining to atomic core admission and recover existing membership without a second roster entry.
- Connect resume/explicit takeover to control generations and role-filtered snapshots.
- Emit private supersession, stop stale command authority, and preserve lock/score across control transfers.

### Acceptance

1. Full-roster reconnect succeeds while a 101st newcomer fails.
2. A duplicate join or controlling reload cannot create a second membership.
3. Takeover rejects a racing answer from the previous generation and leaves the new generation's state consistent.

**Verification:** Two-session and multi-tab integration tests with normalized nickname conflict, removal, full roster, and takeover races.

## E3 S07 Request ledger and replay fencing

**Outcome:** A repeated command recovers an allowed outcome without reapplying it.

**Size:** 2. **Depends on:** E3-S05, E3-S06.

**Planned areas:** Mutation identities, fingerprints, outcome caches, and sequence/fence registry.

### Work

- Authorize actor/page first, check fingerprint/ID reuse, recover permitted cached results, then validate a new mutation's state/deadline.
- Pin successful current-game outcomes separately from 256-entry/2-minute rejected caches; apply the documented per-player and unadmitted-page bounds.
- Reject cancelled, evicted, or retired old identities/sequences and serialize client mutation expectations.

### Acceptance

1. A cached final answer can recover after early closure while a genuinely new late answer fails.
2. Changed content under the same ID never becomes a different mutation.
3. Cache expiry or page retirement cannot turn a replay into a new operation; read/clock queries do not consume mutation order.

**Verification:** Deterministic ledger tests plus transport retries across early closure, supersession, eviction, authorization rotation, and removal.

## E3 S08 Bounded worker import and staging

**Outcome:** A game file becomes a validated candidate without blocking timed gameplay or replacing committed state.

**Size:** 2. **Depends on:** E3-S02, E2-S01, E1-S09.

**Planned areas:** Authenticated raw upload reader, worker compiler, capacity checks, and candidate store.

### Work

- Check provider upload size/timeout behavior and handle edge HTML/errors without parsing them as application outcomes.

- Enforce 10 MiB raw bytes before ordinary main-thread JSON parsing, then validate/compile in one bounded worker.
- Apply 10-second timeout, heap/headroom defaults, field-path errors, and sanitized summary output.
- Stage one five-minute candidate; a new import invalidates the previous uncommitted candidate/generation without replacing the current game.

### Acceptance

1. Failed/oversize/timeout/insufficient-capacity uploads preserve the committed lobby/results.
2. Timed phases reject imports, Start is blocked during an active worker, and no unbounded validation queue forms.
3. A successful summary contains effective settings/tier catalogue but no future prompts or accepted-answer sheet.

4. A dropped public upload response leaves committed state intact and candidate recovery follows explicit review.

**Verification:** Include real-tunnel bounded upload cases.  Real-route/worker tests with small, malformed, large, and forced-capacity fixtures; measure transfer peaks on the reference machine and retain four-target follow-ups.

## E3 S09 Idempotent candidate commit and replacement

**Outcome:** An explicit candidate commit creates exactly one new lobby.

**Size:** 2. **Depends on:** E3-S07, E3-S08.

**Planned areas:** POST /api/host/games and current-game commit descriptors.

### Work

- Drop the tunnel before and after commit and preserve the original request identity.

- Bind candidate/request/context fingerprints and expected game/setup generation to atomic core commit.
- Record lastGameCommit and recover an identical accepted commit before rechecking new-operation phase conditions.
- Invalidate old memberships/control on replacement and notify reachable old clients.

### Acceptance

1. Dropping a successful response then retrying preserves the same game/code and any players already joined.
2. A consumed candidate cannot create a second game even under a fresh request ID.
3. Stale/expired/context-mismatched candidates fail without destroying current state; active timed play rejects new replacement.

4. A gateway failure never proves that a commit failed.

**Verification:** Exercise public-path response loss.  Lost-response and competing commit/Start/import tests, including retries after phase changes and later replacement.

## E3 S10 Start answer and removal dispatch

**Outcome:** The real command path applies existing core rules with server authority and exact receipt time.

**Size:** 2. **Depends on:** E3-S07, E3-S09.

**Planned areas:** game.start, answer.submit, and player.remove transport adapters.

### Work

- Require current tunnel readiness before Start; preserve server-receipt deadlines during later network loss.

- Capture first complete handler receipt and apply synchronous engine mutations through the ledger.
- Check owner authority for Start/removal and current control generation for answers; bind removal to a stable player ID.
- Return neutral acceptance only before reveal and preserve bounded retry behavior.

### Acceptance

1. No client timestamp, points field, or desired identity influences acceptance/scoring.
2. Start closes entry once; the last answer/removal race finalizes once.
3. Accepted acknowledgements contain no assigned tier/current points, and a normal rejection permits a new edited request.

4. A tunnel outage adds no automatic pause or deadline grace.

**Verification:** Test readiness loss and delayed public-path answers.  Actual handler deadline/authorization/race tests with dropped acknowledgements and duplicate commands.

## E3 S11 Atomic uncertain-operation resolution

**Outcome:** The host can establish an uncertain outcome without a delayed request changing it later.

**Size:** 2. **Depends on:** E3-S09, E3-S10.

**Planned areas:** POST /api/host/operations/resolve and recover-or-fence logic.

### Work

- Reconcile after provider errors and connector reconnect using the original operation context.

- Resolve matching current outcomes as APPLIED, obsolete context as SUPERSEDED, otherwise atomically fence and return NOT_APPLIED.
- Invalidate an unresolved creation candidate and advance generation when the fence wins.
- Make repeated resolution safe; preserve owner-scoped records across credential recovery and require revalidation for a new creation attempt.

### Acceptance

1. Original-first and fence-first interleavings cannot both produce a creation/removal.
2. A delayed Start/removal cannot execute after NOT_APPLIED was reported.
3. Lost resolution responses do not create a new operation or falsely enable conflicting controls.

4. Non-JSON gateway errors never enable a new conflicting operation.

**Verification:** Inject tunnel loss around both execution and resolution.  Force both operation/resolution orders, lost resolution replies, owner recovery, cache eviction, and superseded-game cases.

## E3 S12 Complete view publication and redaction

**Outcome:** Clients get complete permitted state with prompt critical changes and bounded readiness batching.

**Size:** 2. **Depends on:** E3-S10, E3-S11, E2-S08, E2-S09.

**Planned areas:** State event publisher, phase timers/outbox, and safe diagnostics.

### Work

- Disable shared caching for personalized/API/transport responses and measure full-view bytes through the tunnel.

- Publish the same complete-view schema for snapshot/change; coalesce only readiness-only emissions for at most 50 ms.
- Immediately emit phase/ack/revocation/closure changes and cancel stale pending emissions by phase/game identity.
- Support Finished-only recap detail and record safe diagnostics/metrics without answers or credentials.

### Acceptance

1. Skipped revisions need no missing patch, and a late older view cannot roll a client back.
2. A batched readiness event never delays early completion or revocation.
3. Raw host/player messages pass all information-boundary assertions, including reconnect and final recap.

4. No cached response or provider diagnostic exposes another session’s secrets or answer data.

**Verification:** Inspect cache headers and redacted connector/application logs.  Fake-scheduler publication tests plus serialized-payload leak tests and metrics/redaction assertions.

## E3 S13 Server protocol integration gate

**Outcome:** The backend supports a complete reliable game before screen work begins.

**Size:** 2. **Depends on:** E3-S12.

**Planned areas:** Production-server protocol scenarios and G3 evidence report.

### Work

- Complete the protocol game through the chosen real tunnel with host and players on different networks, including connector outage and recovery.

- Run a host and two distinct player sessions through multi-prompt import/commit/join/start/retry/lock/results/finish.
- Exercise one owner recovery, one new-tab takeover, one removal, and one lost commit response.
- Verify actual origin/transport policy, resource-limit failures, server restart loss, and private projections against the built app.

### Acceptance

1. The scenario completes with expected scores/counts and no duplicate membership/game.
2. Unauthorized data/actions and stale operations fail without harming admitted sessions.
3. Any unavailable live-origin evidence is explicitly unresolved rather than replaced by a mocked passing claim.

4. The report identifies provider, plan, hostname, host uplink and actual off-network device evidence.

**Verification:** Include forwarded-header spoofing and public unauthorized host calls.  Run relevant contracts/core/server integration suites, retain commands/results and raw-message inspection notes, and close G3 only with its owned evidence.

## Epic gate

A production server completes a host-and-two-player protocol game, including import/commit, admission, phases, private results, final recap, reconnect, and one lost host response. All authority/capacity/negative-path tests owned by this epic pass. Screens are not required yet. Any missing real-origin test remains a blocker to claiming this transport gate, not an implied pass.

Record evidence and the next eligible story using the master handoff template. Fix a failed owned acceptance check before marking its story Done; list externally owned checks without silently certifying them.

