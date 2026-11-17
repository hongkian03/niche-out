# Epic 6: networking efficiency and connection improvements

Implementation update, November 17, 2026. **E6-N01–N07 are implemented; N08 verification/reporting is delivered with polling-only acceptance still open, as recorded in the [evidence report](evidence/NETWORK-IMPROVEMENTS.md).** Current statuses belong only in the [master tracker](../IMPLEMENTATION-PLAN.md#epic-6-networking-improvement-extension).

## Scope and fixed decisions

Retain 100 admitted players plus the host, automatic per-session Cloudflare Quick Tunnels, no required provider account/domain, and the existing game rules. The cancelled 200-player extension is not part of this plan. A passing workload remains a scoped result; no application optimization increases a provider quota or guarantees internet availability. The README network disclaimer stays appropriate.

Implement one reviewable story at a time, verify it, then continue. Sizes are the existing relative units 1/2, not days or hours. Split a story before implementation if its contract changes or review surface exceeds one cohesive concern. No delta protocol, new persistence, distributed game server, paid provider, or unsolicited UI redesign is proposed.

Inputs:

- [Networking baseline](evidence/NETWORK-BASELINE.md): repeated snapshots, global reconnect publications, diagnostics overhead and polling ACK failures.
- [Independent review](evidence/NETWORK-BASELINE-REVIEW.md): measurement boundaries and actual browser recovery.
- [Singapore capacity run](evidence/SINGAPORE-CAPACITY.md): ten authored rounds, 100 mixed clients, zero client retries, approximately 1.07 GiB origin TCP egress and increasing later-round work.
- [Earlier alternatives investigation](evidence/EPIC-6-ALTERNATIVES.md): historical research. The owner's subsequent decision retains Quick Tunnels; optional named-provider work is excluded here.

## Execution order and issue mapping

Issue IDs follow the [baseline worklist](evidence/NETWORK-BASELINE.md#relation-to-the-networking-worklist): N1 provider headroom, N2 DNS/interrupted submissions, N3 snapshot traffic, N4 latency tails, N5 synchronized client activity, and N6 missing qualification. Story IDs use the separate E6-N01–N08 namespace.

| Story | Size | Depends on | Deliverable | Addresses |
| --- | --- | --- | --- | --- |
| E6-N01 | 1 | E6-S01 and retained baseline | Less intrusive, correctly attributed diagnostics | Observer overhead; N4 measurement quality |
| E6-N02 | 2 | N01 | Reuse an immutable snapshot during synchronous read/publication scopes | N3 repeated work; N4 history-dependent CPU/tails |
| E6-N03 | 2 | N02 | Coalesce redundant global publications | N1 request pressure; N3 traffic; N4 reconnect stalls |
| E6-N04 | 2 | N03 | Remove unused standings from live player views, with coordinated contract migration | N3 payload size; N4 projection/validation work |
| E6-N05 | 1 | N04 | Bounded randomized reconnect scheduling | N1 reconnect pressure; N5 synchronized activity |
| E6-N06 | 2 | N05 | WebSocket-first opening with reliable polling fallback | N1 startup pressure; N5 negotiation |
| E6-N07 | 1 | N06 | Stagger clock sampling without sacrificing countdown accuracy | N5 periodic bursts |
| E6-N08 | 2 | N01–N07 | Matched benchmark, browser recovery and portable-candidate report | N1–N6 verification and release handoff |

N2 is the unresolved DNS/interrupted-action boundary; these stories must preserve authoritative recovery but cannot claim to fix an external DNS failure. N6 covers qualification limits, not a promise to certify 100 physical phones through simulation. Existing E6-S02/S03 consume N08's capacity evidence; S04/S05 still require their declared real-device/assistive-technology evidence. Finish these networking changes before freezing a new candidate for S06–S11. S12 publication stays separately authorized.

## Common implementation and test rules

- Preserve per-recipient authorization, role/phase redaction, owner recovery, removed identities, explicit tab takeover, server deadlines, request IDs/fences and duplicate safety.
- ACKs and phase changes remain immediate. Batching schedules work within the existing 50 ms window; actual execution delay under a busy event loop is measured separately rather than represented as a real-time guarantee.
- Read-only caches must never outlive the state they describe. Never cache an authorization decision or an entire personalized view across identities.
- Preserve complete permitted views. Shared public data can be reused internally, but player-specific answer/control fields remain individually projected.
- Keep historical measurements immutable. Record source/compiled/lock/fixture/workload hashes and instrumentation mode for every new comparison.
- Run focused correctness checks per story. Use short local measurements to assess that story; reserve full provider campaigns for N08 or an unresolved failure. Benchmark jobs run serially, with builds/browser audits idle.
- Do not lengthen ACK/deadline budgets, reduce the player count, remove polling, or invent fresh answer IDs merely to obtain a passing result.

## E6-N01: remove observer-induced snapshots

**Outcome:** Diagnostic phase labels no longer perform additional full engine snapshots.

**Files:** [application.ts](../../apps/server/src/game/application.ts), [load server](../../scripts/load/server.mjs), [collector](../../scripts/load/metrics.mjs), [application tests](../../tests/server/application.test.ts), [collector tests](../../tests/server/baseline-metrics.check.mjs).

Implementation:

1. Pass phase/context already obtained by the measured operation into the private profile helper. Remove its `engine.state().phase` call. Do not replace it with another hidden state read or a stale global phase variable.
2. Keep off/light/detailed boundaries explicit. Retain bounded aggregate collection, separate extra diagnostic JSON-copy time, request deduplication and post-workload explicit GC.
3. Keep nested/inclusive labels accurate. Add a bounded measurement of snapshot builds/copies if needed for N02, without constructing snapshots to count them. Keep diagnostic output private and payload-free.

Testing and completion:

- A test compares snapshot-build observations with profiling enabled/disabled for the same operation; phase labels themselves add none. Throwing observers still cannot alter gameplay or expose diagnostic routes.
- Existing collector capacity/redaction and exact HTTP-accounting tests pass. Empty stage histograms remain null; GC stays outside active intervals.
- Repeat the small counterbalanced off/light/detailed local workload. Record remaining observer cost, not a promised zero-overhead figure. Preserve the earlier ~30% result as historical evidence.

## E6-N02: reuse snapshots within read scopes

**Outcome:** Generating views for a publication does not copy all accumulated history repeatedly for every authentication and projection helper.

**Files:** [application.ts](../../apps/server/src/game/application.ts), [sessions.ts](../../apps/server/src/game/sessions.ts) if its callback boundary needs an adapter, [engine.ts](../../packages/game-core/src/engine.ts) for snapshot semantics, [core engine tests](../../tests/core/engine.test.ts), [server application tests](../../tests/server/application.test.ts), [identity tests](../../tests/server/identity.test.ts), [recovery tests](../../tests/server/recovery.test.ts).

Implementation:

1. Inventory state reads in membership, `actorFor`, `member`, `currentMember`, `hostView`, `viewFor` and publication. Establish a short synchronous read scope that captures one immutable snapshot and supplies it to these reads, including session membership callbacks.
2. Start with reuse within a read/publication batch. Do not introduce a broad revision-keyed engine cache until every mutation/invalidation boundary has been proven; revision alone must not hide an in-progress mutation. Never retain a scope across `await`, command mutation, timer wake, game replacement or shutdown. Restore nested context in `finally` if scoped plumbing is used.
3. Retain live session/page/control/owner checks for each recipient; reuse game data rather than granting authority from cached verdicts. Keep the trusted snapshot server-private and select outgoing fields explicitly.

Testing and completion:

- Snapshot immutability: earlier snapshots cannot change after acceptance, removal, connection change, finalization or replacement. External callers cannot mutate the engine through a snapshot.
- Mutation/read ordering: two submissions in one turn, early final answer, late deadline, removal and takeover immediately affect the next view. Expiry or owner rotation during recipient checks must not reuse another authority's data.
- Privacy: personalized views keep distinct own answers/control generations; current tier/points/future prompts remain hidden. Old-game data never reaches a new game's view.
- Measured snapshot-build count drops for the matched read batch. Local 100-player/20-round comparisons report early-versus-late CPU, view time, event-loop tails and allocation; no exact speedup is assumed in advance.

If a safe scoped implementation cannot fit cleanly, split explicit snapshot-provider plumbing from wider read optimization. Do not silently change core snapshot ownership semantics to save copies.

## E6-N03: coalesce redundant global publications

**Outcome:** Joining/resuming players receive immediate authoritative state while shared roster/readiness changes avoid one full-room publication per event.

**Files:** [application.ts](../../apps/server/src/game/application.ts), [hosting-status.ts](../../apps/server/src/game/hosting-status.ts), [application tests](../../tests/server/application.test.ts), [recovery tests](../../tests/server/recovery.test.ts), [lifecycle tests](../../tests/server/e5-lifecycle.test.ts), [load runner](../../scripts/load/run.mjs), [architecture](../ARCHITECTURE.md).

Implementation:

1. Replace the ambiguous boolean publication choice with explicit immediate versus coalescible causes. Document that join/connection-status/readiness notifications can share a scheduled batch; ACKs, final-answer transitions, phase timers, removals, game closure/replacement and hosting authority changes remain immediate where correctness requires it.
2. Give each joining/resuming client its targeted current view immediately. Avoid an unchanged global publication when an already-connected session resumes without a globally visible state change. Initially retain the client's authoritative `state.get`; removing that read is separate work, not required here.
3. Keep one pending batch, cancel or supersede it on immediate events, and construct fresh state at flush. Fence pending work against old game/phase/instance, clear timers on shutdown and keep phase-deadline scheduling independent of delayed roster delivery.

Testing and completion:

- Fake-clock tests prove scheduled coalescing does not exceed the configured 50 ms scheduling window and does not reset deadlines. An immediate phase change cancels/flushes earlier pending metadata correctly.
- Join ACK + targeted snapshot is available before the roster batch. A last answer transitions immediately; accepted locks and points remain correct. Remove/takeover/owner-revoke races cannot send a delayed privileged view.
- Burst tests cover 100 joins, disconnects and resumes, plus replacement/close before batch flush. Shared counts eventually match the authoritative roster.
- Matched reconnect measurements show fewer global publications and recipient views than the recorded 5,050 disconnect / 5,184 resume attempts. Record time/bytes saved and any new tail. Do not confuse view counts with HTTP request counts.

## E6-N04: remove unused live player standings

**Outcome:** Reading/Answering player messages carry the personal total and required live fields without the full unused standings array. Host live standings and Results/Finished standings remain available.

**Files:** [view contracts](../../packages/contracts/src/views.ts), [wire version](../../packages/contracts/src/wire.ts), [projections](../../packages/game-core/src/projections.ts), [client](../../apps/web/src/client.ts), [Player](../../apps/web/src/Player.tsx), [Host](../../apps/web/src/Host.tsx), [protocol fixtures](../../tests/protocol/view-fixtures.ts), [protocol tests](../../tests/protocol/views.test.ts), [projection tests](../../tests/core/projections.test.ts), [client tests](../../tests/web/client.test.ts), [browser fixtures](../../probes/web/fixtures.tsx), and other protocol-literal consumers found by repository search.

Implementation:

1. Reconfirm no live player UI reads `publishedStandings`. Remove it from the live player schema/projection only; retain `publishedTotal`, own-answer lock, readiness, deadlines and control generation.
2. Treat field removal as a wire-contract change. Update the server/browser/contracts/fixtures atomically in one bundled candidate. **Default compatibility policy: version the incompatible contract and update version literals/handshake checks together.** Do not keep publishing protocol 1 with silently incompatible strict schemas. If this migration exceeds a size-2 story, split N04-A contract/version migration and N04-B payload reduction; N04 remains unfinished until both pass.
3. Rebuild actual fixtures and document the planned live-view contract. Fresh server/session boundaries remain explicit. Do not introduce empty/fabricated standings as a bandwidth workaround or silently reuse an old browser's credentials across a new instance.

Testing and completion:

- Live player views validate without standings and reject unauthorized/unexpected fields. Host live, round results, final recap and tied ranks retain correct standings.
- Reload/reconnect/uncertain-answer paths render the same personal state. Browser tests cover a complete game with the reduced shape.
- Explicit incompatible-version tests reject old envelopes/views without hanging in a malformed partial state. The exact migration/error presentation is reviewed before coding; support for old/new live sessions is not presumed.
- Compare serialized bytes and projection CPU for identical 100-player states before/after. Require an actual byte reduction; measure the fraction saved rather than promising one from the old illustrative estimate.

## E6-N05: bounded randomized reconnect waits

**Outcome:** Clients do not all retry at identical fixed delays after an interruption.

**Files:** [client.ts](../../apps/web/src/client.ts), [client tests](../../tests/web/client.test.ts), [application tests](../../tests/web/app.test.ts), [browser baseline](../../scripts/load/browser-baseline.mjs), [architecture](../ARCHITECTURE.md).

Implementation:

1. Inject a random source through `ClientOptions`, defaulting to normal runtime randomness. Proposed initial policy: equal jitter in the half-to-full range of each existing 1/2/4/8/15-second base delay: 0.5–1, 1–2, 2–4, 4–8 and 7.5–15 seconds. Keep these values centralized and testable.
2. Keep five attempts. Maximum scheduled waits remain 30 seconds; connection-opening timeouts, discovery and ACK budgets are separate. Do not rely on Socket.IO's built-in randomization while `reconnection: false` remains set.
3. Clear scheduled work on disposal, terminal states and supersession; reset attempt accounting only after authoritative recovery. Preserve one active connection/recovery task and the same request IDs for uncertain operations.

Testing and completion:

- Seeded/fake-clock tests exercise minimum/maximum random values, backoff, exhaustion, successful reset and cancellation.
- Superseded tabs never reclaim control automatically; revoked/removed sessions cannot reconnect around the denial. No extra answer or host mutation is generated by a retry timer.
- A controlled multi-client outage shows distributed scheduled retries and records actual recovery times/request peaks. Capacity failures are still reported; randomness is not a guarantee that every peak decreases in one public run.

## E6-N06: WebSocket-first opening with bounded fallback

**Outcome:** Compatible clients connect directly by WebSocket; polling still works when WebSocket is rejected or silently blocked.

**Files:** [client.ts](../../apps/web/src/client.ts), a small new transport adapter under `apps/web/src/` if needed, [client tests](../../tests/web/client.test.ts), new real-browser negotiation probe under `scripts/load/`, [browser baseline](../../scripts/load/browser-baseline.mjs), [protocol/ingress tests](../../tests/server/application.test.ts).

Implementation:

1. Prefer WebSocket using the installed Socket.IO/Engine.IO APIs. Keep application-owned reconnection and session reconciliation. Carry explicit opening-transport/error information through a testable adapter rather than scattering Socket.IO internals across UI components.
2. On immediate transport failure, try allowed fallback. On a silently stalled WebSocket opening, explicitly switch the next bounded attempt to polling after the existing 10-second opening timeout; `tryAllTransports` alone is not assumed to handle the Manager timeout. Count fallback openings within the existing attempt budget and avoid parallel orphaned managers. Keep the opening timeout distinct from the 2-second command ACK budget.
3. Keep valid host/player cookies, exact origin enforcement and role/tab authority checks. Distinguish network opening errors from structured authentication/removal/instance errors. Polling is not an authorization bypass. Proposed preference policy: retain fallback for the remaining current recovery cycle, keep an established polling connection working, then start a later independent recovery cycle or explicit restart with WebSocket again. Do not persist a permanent polling preference in browser storage.

Testing and completion:

- Adapter tests cover WebSocket success, immediate rejection, silent opening timeout, polling success, both unavailable, repeated failures, cleanup and attempt exhaustion.
- Real Chrome runs block WebSocket explicitly while allowing HTTP, then silently stall opening; both must reach a usable polling game within documented bounds. A supported-network run observes WebSocket use with no initial Engine.IO polling exchange.
- Verify cookies/origin, owner role conflict, revocation/removal, tab takeover, refresh and network loss. Authenticated denials must not be relabelled as harmless network fallback.
- Run the actual-browser accepted/unaccepted-answer recovery probe after the change. Forced Node `mixed` load remains a separate capacity test and cannot validate browser negotiation.

## E6-N07: stagger clock sampling

**Outcome:** Countdown synchronization remains accurate without three immediate samples per client and aligned periodic bursts.

**Files:** [client.ts](../../apps/web/src/client.ts), [client tests](../../tests/web/client.test.ts), [Timer component](../../apps/web/src/components.tsx), [player tests](../../tests/web/player.test.ts), [browser/load probes](../../scripts/load/), [architecture](../ARCHITECTURE.md).

Implementation:

1. Keep the first sample immediate and useful. Proposed initial follow-up delays are independently 250–750 ms and 1,000–2,000 ms after the first sample completes, using the injected random source; serialize requests if a slow reply overlaps a planned slot. Retain the best valid RTT/offset measurement within a 60-second freshness window. A late reply from an obsolete batch must never displace a newer estimate.
2. Proposed periodic schedule: start the next batch 30 seconds plus a one-time random 0–5-second offset after the initial batch, then use independently randomized 27–33-second waits between completed batches. This bounds scheduler waits rather than promising a response during an outage. Keep at most one batch active, preserve the view-based initial anchor, and document these tunable intervals in the architecture when implemented. Server-deadline authority is unchanged.
3. Own and cancel every sampling timer on disconnect, supersession, terminal state, disposal and game/instance change. Late samples from an earlier context cannot overwrite the current clock estimate. Prevent overlapping batches.

Testing and completion:

- Fake-clock/RTT tests prove the first synchronization is immediate, delayed samples improve or preserve the estimate, stale/invalid/high-RTT replies are handled correctly, and no batch overlaps or survives disposal.
- Test nonzero client/server offset, a delayed response, short phases, reconnect and late old-game replies. Displayed countdown must stay within the existing UX expectations; sampling never extends a server answer deadline.
- Multi-client traces show lower alignment of periodic calls. Add explicit clock sampling to a new workload/browser cohort; label it separately from old forced-client baselines that omitted those samples.

## E6-N08: regression, comparison and handoff gate

**Outcome:** Each claimed improvement is backed by matched evidence, and remaining Quick Tunnel limitations are explicit.

**Files:** [load runner](../../scripts/load/run.mjs), [suite](../../scripts/load/baseline.mjs), [collector server](../../scripts/load/server.mjs), [report renderer](../../scripts/load/summarize-baseline.mjs), [pack scenario](../../scripts/load/pack-scenario.mjs), [browser probe](../../scripts/load/browser-baseline.mjs), [portable smoke](../../scripts/test-portable-host.mjs), and a new evidence report under `docs/implementation/evidence/`.

Sequence:

1. Run full types/build/application tests, collector/sanitizer/scenario checks, affected protocol privacy checks and browser asset scan. Record exact counts; do not simply inherit the last 433-test pass.
2. Freeze measured code. Run the counterbalanced local off/light/detailed sequence and the matched 100-player local WebSocket/polling and public mixed/polling workloads. Keep the same old fixtures, transport ratios and pacing for before/after comparisons.
3. Repeat the original Singapore ten-round game with unchanged JSON/timers and 2–20-second pacing. Check all 1,000 unique answers, scores/ranks/counts and duplicate replays. Compare against 1.07 GiB origin traffic, ~298 MiB peak app RSS, 2.09 ms accepted-handler p95 and transport-specific E2E p95 ~200/498 ms, with network variability stated.
4. Run a separate browser-negotiation/clock-sampling workload; real-browser blocked-WebSocket fallback; accepted-ACK loss, before-delivery answer loss, draft recovery, takeover and owner recovery. Test short/longer interruption without automatically inventing new answer IDs.
5. Check retained memory/resource bounds, cleanup and any newly introduced caches/timers. Rebuild a new private portable candidate and run available-Mac smoke against its actual extracted files, including new wire version and connection behavior. Preserve older archive evidence under its original hashes; final public signing remains the existing downstream work.

Acceptance:

- No score/privacy/identity/deadline regression. The matched Singapore mixed game completes at 100 players; processing p95 retains the existing target. A previous failure stays visible rather than being retried until green.
- Snapshot build counts, redundant publication/view counts and live-view byte sizes demonstrably decrease for their targeted deterministic cases. Report actual CPU, tails, traffic and memory; if a noisy runtime result does not improve, investigate and report it instead of claiming a universal speedup.
- ACK retries/failures, DNS/429/transport errors, generator/connector/app resource scope and stage timings remain separate. Diagnostics overhead is quantified. New-clock workloads are not presented as exact old-workload comparisons.
- If polling-only still fails under Quick Tunnels, record the remaining limitation and keep its universal-capacity claim open. Completion of these improvements is not a promise to overcome a provider's hard quota. Any acceptance-scope change requires an explicit product decision.
- The final report links changed files, raw reports, fixtures/hashes, fixes, unresolved findings and manual steps. Other host-platform execution remains deferred to the owner; emulation is not physical-device certification.

## Verification commands and evidence ownership

Run commands from the repository root using the pinned Node 24.22.3/npm 11.19.1 runtime. These are future verification steps, not checks executed as part of this planning change. Browser probes need the configured local Chrome installation; tunnel jobs need internet and the verified connector.

| Scope | Existing entry points | Story |
| --- | --- | --- |
| Types, bundled build, full application regressions | `npm run typecheck`, `npm run build`, `npm test` | Each affected story; full pass at N08 |
| Core snapshots, scoring and projections | `npm run test:core` | N02/N04 |
| Server identity, publication, recovery and lifecycle | `npm run test:server` | N01–N04 |
| Browser client and UI logic | `npm run test:web` | N04–N07 |
| Collector and pack-scenario checks | `node --test tests/server/baseline-metrics.check.mjs scripts/load/pack-scenario.check.mjs` | N01/N08 |
| Matched local/provider capacity campaign | `node scripts/load/baseline.mjs --plan`, followed by a fresh `--out-dir` run | N08; local subset for earlier stories |
| Real-browser recovery probe | `npm run test:network:browser` | N04–N08 as affected |
| Responsive layout and accessibility | `npm run test:web:layout`, `npm run test:accessibility` | N08 after contract/client changes |
| Extracted available-Mac candidate | `npm run test:portable -- <extracted-candidate-directory>` | N08 |

Before changing connection logic, extend the browser probe with the blocked/silent-WebSocket cases in N06; existing recovery checks alone do not cover them. Likewise, add explicit clock sampling to the separately labelled N07 workload. Those are planned harness changes, not capabilities implied by the current commands.

For the unchanged Singapore-pack comparison, the existing runner supports:

```sh
node scripts/load/run.mjs --tunnel --players=100 --transport=mixed --games=1 --pack=examples/game.singapore.json --diagnostics=light --no-reconnect-burst --answer-delay-ms=2000 --answer-spread-ms=18000 --label=singapore-network-after --out-dir=work/network-improvements/singapore-after --uplink=eduroam
```

Confirm the actual network when executing; `eduroam` above reproduces the retained baseline's label and must be changed if the uplink differs. Use a fresh output directory. Run capacity campaigns serially; browser audits and builds must not compete with a measured run.

Each implementation story supplies a short completion record: changed files, checks executed, deterministic pass/fail criteria, focused before/after counters, remaining uncertainty and any required manual step. N08 produces the consolidated report with raw report links and exact artifact/workload hashes. Keep public evidence sanitized: no private host links, cookies, tokens or unnecessary answer-pack contents. A new browser or artifact build is never represented as the earlier tested one.

## Stop and review points

Stop a story if its proposed cache cannot preserve snapshot/authorization semantics, the 50 ms batching design delays a phase or ACK, the wire migration cannot reject stale clients clearly, or fallback exceeds the declared retry budget. Keep that story in review and resolve the specific design issue before stacking later changes on it.

Begin implementation with **N01**, verify its evidence, then continue to N02; routine story review does not require a new user approval unless a product decision or blocker emerges. The owner subsequently authorized implementation and tests. Consult the master tracker and evidence report for outcomes; public release remains separately authorized.
