# Independent networking baseline review

Reviewed November 16, 2026 against the existing Epic 6 workload, current production client/server sources, and the baseline tooling under development. This is an evidence-quality review, not a claim that the proposed networking optimizations are implemented. The coordinator's baseline report records executed runs and exact build identity.

## Findings that must remain separate

| Issue | Direct observation | What is not yet established | Baseline evidence needed |
| --- | --- | --- | --- |
| N1 — Provider headroom | Prior all-polling reconnect runs recorded 45 and 43 HTTP 429 transport errors. The bounded follow-up restored connections. | Origin HTTP in-flight counts cannot reveal all requests rejected at the edge; a reconnect recovery is not a completed game pass. | Actual edge error count and stage, reconnect duration/attempts, origin counts separately, eventual functional outcome. |
| N2 — DNS and interrupted answer | Prior Node polling recorded `ENOTFOUND`; a pending never-accepted answer was fenced after resume advanced the request sequence. | That one DNS code does not prove every earlier status-0 drop had the same cause, or identify eduroam/provider/root resolver fault. The forced Node client is not the browser client. | Structured underlying error codes; browser recovery at precise before-delivery and after-acceptance boundaries; no silent replacement mutation ID. |
| N3 — Snapshot traffic | Prior mixed 60-round run emitted approximately 403 MiB at the application-to-connector TCP boundary. | This is not outer encrypted internet-wire traffic or a fixed per-event allowance. | Per-stage/cause view counts, recipient counts, projection/emit/diagnostic serialization cost, payload bytes versus TCP counters. |
| N4 — Long tails | Prior combined interruption/disconnect/cold-load case reported approximately 2.8 s maximum event-loop delay. | The cause is not isolated. Prior forced GC and extra diagnostic serialization can contribute. | Stage-local histograms, explicit GC outside active intervals, inclusive profile interpretation, off/light/detailed comparisons. |
| N5 — Synchronized client activity | Browser source uses deterministic custom reconnect waits and polling-first startup. | The forced-transport generator does not exercise browser upgrade/fallback or periodic clock-sampling traffic. | Actual browser polling/WebSocket trace; forced-mode benchmarks labelled correctly. |
| N6 — Qualification coverage | Previous 100-player mixed workload and a 100-client asset burst passed on an 18 GiB M3 Pro over eduroam. | No 8 GiB certification, 100 physical browsers/phones, independent cellular capacity, eventual venue qualification, or multi-hour soak follows. | Explicit hardware/network/workload provenance and missing matrix; separate actual-browser probe. |

## Benchmark assumptions and corrections

1. **Socket ownership:** the original generator replaced `c.socket` on every connection without disposing the old manager, and registered a browser only after a successful connection. A failed connection could escape ordinary cleanup. The baseline runner now tracks every attempted socket, closes the previous manager, removes completion listeners and registers identities before connecting. This is a harness correction, not an optimization of the production client.
2. **Failed-action visibility:** acknowledgement percentiles previously counted completed responses while failures lived in a separate retry array. The baseline retains failed action durations and stage/error categories; a low successful-response p95 cannot hide an incomplete run.
3. **Opening timeout:** original forced clients allowed 20 seconds, while the production browser config uses 10 seconds. The updated forced runner aligns that timeout. Its recovery orchestration still does not instantiate `GameClient`, so it must not be described as behaviorally identical to the UI.
4. **Resume and request ordering:** recovery generates a newer `game.resume` request. A never-applied older mutation can correctly become stale afterward. Benchmark code must not make up a new answer ID to force the expected score. The browser's intended behavior is authoritative reconciliation followed by explicit player resubmission when no answer was accepted.
5. **GC contamination:** original child snapshots forced GC before measuring cumulative event-loop delay/CPU. The baseline snapshots do not force GC. Final explicit GC is timed separately, outside active event-loop measurement. Heap snapshots without GC must not retain an `AfterGc` label.
6. **Instrumentation:** detailed view-byte measurement performs an additional JSON serialization. It can materially change workload cost and memory. Off/light/detailed comparisons quantify this disturbance; detailed profile categories are nested inclusive intervals, not additive totals. Socket emit duration is synchronous enqueue work, not delivery to a device.
7. **Stage resolution:** event-loop monitoring has 10 ms resolution. Very short stages may contain no samples; empty histogram sentinels must not be called sub-microsecond responsiveness. Stage boundaries also cannot prevent already scheduled readiness batches from firing in the next stage.
8. **Accelerated fixture:** the load pack uses 0.2-second reading/results phases and closes answering early when all valid answers arrive. The pack's 30-second answer limit is usually not elapsed. These runs stress transition throughput; they do not directly measure a normal 3/25/10-second event. Event-duration bandwidth models remain conditional estimates.
9. **Resource scope:** application CPU/RSS exclude the load generator, connector, browser and native guard. The baseline records generator and connector measurements separately where available. Same-machine client/server processes still share CPU, RAM and uplink.
10. **Counter boundary:** logical payload bytes, application-to-connector TCP bytes and provider-edge traffic are distinct. They must not be summed or substituted for each other. Application counters cannot see 429 requests that never reach the origin.
11. **Repeatability:** git commit alone is insufficient for dirty/untracked edits. Retain tree and lock hashes, exact compiled server/browser hashes, mode, fixture hash and workload shape. Counterbalanced mode order with two repetitions demonstrates variability; it does not establish statistical significance.
12. **Lifecycle:** startup, per-run and suite deadlines require owned child cleanup. An orchestration timeout must not leave an orphaned server or tunnel. Repeated measurements should not run concurrently on the same host.

## Actual-browser recovery probe

`scripts/load/browser-baseline.mjs` starts a fresh Chrome process and production host/player UI behind one owned temporary tunnel. It preserves the current connection negotiation policy and uses phone-size viewports. The run requires a separate quiet window after capacity measurements.

The probe performs three distinct cases:

- **After acceptance, before acknowledgement:** route only the test player's WebSocket. Forward its answer to the real server, withhold consequent state messages, drop the matching ACCEPTED acknowledgement and close that transport. Reconnection must recover the accepted lock. This deliberately creates uncertainty until a fresh authoritative view is available.
- **Unsubmitted draft:** freeze connectivity on a second browser context; the draft must freeze, return after reconnection, and remain unsubmitted until an explicit click.
- **Before delivery:** drop an outgoing answer and close the connection before forwarding it to the server. The UI must reconcile an unlocked answer and offer explicit resubmission. Observe outgoing answer fingerprints to ensure no automatic new-ID submission. An explicit later click must create a new request and complete the game with exact expected totals.

The WebSocket route is synthetic test fault injection. It does not reproduce DNS failure, an actual provider outage or 100-browser negotiation. It also requires the real client to establish WebSocket; if that does not occur, the probe reports a failure rather than silently forcing another transport. Report output contains event names, status/error codes and one-way request fingerprints, never raw frames, cookies or private/public URLs. Screenshots are player gameplay states without a hosting invitation.

```sh
# After building, and only after other benchmarks have stopped:
node scripts/load/browser-baseline.mjs
# Optional visible Chrome for watching the same automated steps:
node scripts/load/browser-baseline.mjs --visible
```

Each invocation creates a fresh directory under `work/network-baseline/browser-*/` containing `report.json`, sanitized timeline, screenshots and pass/fail outcome. The coordinator links the actual execution result; writing this harness is not itself a passing browser result.

## Inspecting the measurements yourself

| Question | Fields to inspect |
| --- | --- |
| Did the game actually finish correctly? | `status`, `checks`, `failures`, `failedActions`, fixture/score assertions |
| Was an error DNS, provider quota, timeout or another failure? | `transportErrors[].category/status/cause/stage/atMs`, `retries`, connection timeline |
| Were retries identical and recovery bounded? | Retry counts, recoveries with attempt/duration, browser answer fingerprints and injected-fault timeline |
| What transport really opened? | `negotiatedTransports`; browser polling requests plus WebSocket-open events |
| Is the percentile server work or a network round trip? | `summary.serverByOutcome` versus `summary.endToEndByOutcome`; failed actions separately |
| What caused fan-out? | `server.instrumentation.profiles` grouped by stage/name/cause/role; recipient totals |
| Did instrumentation distort the result? | Counterbalanced off/light/detailed runs of the same workload shape; detailed diagnostic serialization profiles |
| Did memory persist or merely remain resident? | Used heap and RSS separately; final explicitly timed GC record; bounded collector size |
| Which software and workload were tested? | Git/tree/lock/build hashes, fixture SHA-256, configuration, workload-shape hash and compiled artifact hashes |

Use the final baseline suite's generated `REPORT.md` for the tables and the adjacent individual JSON reports for the above fields. Earlier Epic 6 evidence remains historical evidence and should not be overwritten by the new baseline.

## First new suite: independent raw-evidence cross-check

The first new measured suite is under `work/network-baseline/measured/`. All six local off/light/detailed comparison runs and the local polling run passed. The public mixed run passed; the public polling run failed during zero-based round index 16 accepted submissions.

Crucially, this new polling failure is **not the same recorded signature as the historical failure**. It contains no recorded DNS error or HTTP 429 transport error. Its failing action exhausted three 2-second acknowledgement attempts (approximately 6.001 seconds). The final snapshot retained 101 connected sockets, and the last accepted-submit stage contained 167 server `ACCEPTED` samples including duplicate retries. There were 287 recorded retries overall and three failed actions visible at the captured boundary. This shows that the application continued to process commands while some client acknowledgement waits failed; it does not isolate where delivery was delayed. Do not assign the historical DNS cause to this new run.

The detailed local repetitions used approximately 11.49–12.29 application CPU seconds versus 8.99–9.35 seconds with diagnostics off. Mean detailed CPU was about 29.6% higher; accepted-response end-to-end p95 was about 13.5% higher on the mean of these two repetitions. These are small-sample comparisons, not significance estimates, but they establish that detailed measurement is a material part of the observed cost. Preserve off/light measurements for production-cost interpretation and use detailed profiles for attribution.

## Executed browser result

The post-capacity browser probe **passed all five checks** on November 16 (local client date). Evidence: `work/network-baseline/browser-1794887177893/report.json` and its four player screenshots. The actual built browser client opened polling and upgraded to WebSocket, recovered an accepted answer after its acknowledgement was dropped and the transport closed before a resulting view arrived, preserved an unsubmitted offline draft without submitting it, and reconciled an answer deliberately dropped before delivery as unlocked. No automatic new-ID answer was emitted; explicit resubmission then completed two rounds with both players tied on exactly 200 points.

The accepted and unaccepted recovery screenshots were visually inspected. They show the locked answer preserved in round one and the explicit “No answer is locked. You can submit again while time remains.” feedback in round two. The fault gate was configured to withhold any resulting view before closure, but no such view arrived before the dropped acknowledgement in this run; no view-withholding event is claimed. Fresh Chrome and the owned tunnel were closed after the probe. This validates those controlled browser recovery boundaries; it does not establish that every historical DNS/polling acknowledgement failure is resolved.

## Confirmed source candidate: repeated full-history snapshots

Read-only follow-up found a concrete scaling mechanism in `packages/game-core/src/engine.ts`: `GameEngine.state()` constructs fresh player objects and fresh copies of every accumulated round, submission, points row and result group, then recursively freezes the new structure. It reuses already-frozen compiled definition/answer objects; it should not be described as copying the entire answer bank on every read.

The ordinary player `sendView` path takes approximately eight such snapshots on a successful read: one during authenticated session touch, and seven in `viewFor` through its current-member lookup, controller validation, player projection and current-control lookup. This count follows the current static call graph, not a new runtime counter. `sessions.membership` invokes `engine.state()` even when only a player's membership is needed. None of these small lookups needs the full prior-round content for its immediate purpose, yet they pay for it.

There is also a **confirmed observer amplifier**: the first detailed profile implementation retrieves `engine.state().phase` for each profile event. On an emitted player view, the player-projection, outer projection, emit and diagnostic-serialization profile calls add four further full snapshots, plus one at publication completion. Consequently, the first detailed profiles cannot be represented as undisturbed production costs.

Existing phase-matched data from `public-mixed-detailed-tunnel-mixed-100-1794886576690.json` shows:

| Zero-based round | Answering player-projection samples | Mean wrapper time | Mean emitted player payload |
| --- | ---: | ---: | ---: |
| 0 | 400 | 0.3397 ms | 12,155.5 bytes |
| 4 | 200 | 0.8410 ms | 12,306.0 bytes |
| 9 | 200 | 1.4902 ms | 12,359.1 bytes |
| 14 | 200 | 2.0754 ms | 12,410.9 bytes |
| 18 | 200 | 2.6132 ms | 12,410.9 bytes |
| 19 | 100 | 2.7168 ms | 12,411.8 bytes |

All rows select Answering phase within that round's accepted-submit stage. Wrapper cost increases approximately eightfold while the emitted payload grows approximately 2.1%. This corroborates a history-dependent server cost beyond merely sending larger views. It does **not** by itself prove snapshot copying is the sole cause of delayed acknowledgements: the wrapper also includes membership/controller work, readiness/standings computation and schema projection, and this is one detailed run with observer overhead elsewhere.

Timing precision matters: `player-projection` duration is evaluated before that profile call retrieves the phase, so its own diagnostic phase snapshot is excluded from its recorded duration. The outer projection interval includes the nested player-profile phase lookup; publication includes all its child work. These nested intervals must not be added together.

The coordinator is investigating a lightweight follow-up to distinguish observer effects. No caching, read API, gameplay or broadcast optimization was applied during this independent review. A future fix should preserve immutable snapshots and privacy while avoiding full-history reconstruction for repeated metadata/member reads; its acceptance requires the same workloads and state-correctness regressions.
