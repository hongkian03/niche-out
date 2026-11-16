# Epic 6 — capacity, churn and recovery evidence

Run date: November 16, 2026. This is measured evidence for E6-S01–S03, not a blanket certification of 100 physical devices or every event network.

**Result:** the compiled server passed 100-player local churn and a real Cloudflare Quick Tunnel run with 80 WebSocket players, 20 polling players and one WebSocket host. A separate mixed outage/cold-burst scenario also passed. The all-polling follow-up restored the 100-player reconnect burst using bounded recovery, but later failed the complete-game assertion following a client DNS interruption and a correctly fenced pending answer. That path remains unqualified. Provider HTTP 429s were observed; they are retained as findings, not discarded because a later retry worked.

## What was added

- [`scripts/load/run.mjs`](../../../scripts/load/run.mjs): bounded simulated clients, exact scoring/assertions, cold asset delivery, reconnect bursts, invalid/valid submissions, duplicate requests, old-game fencing, waiting-session pressure, read-rate pressure, optional connector suspension, and raw JSON reports including failures.
- [`scripts/load/server.mjs`](../../../scripts/load/server.mjs): a separate child process running the compiled production application and the real managed connector, with CPU/RSS/GC/event-loop sampling.
- [`application.ts`](../../../apps/server/src/game/application.ts): an optional **private** measurement callback and private snapshot method. No public diagnostic endpoint, player answer collection, cookie output, or gameplay rule change was introduced.
- [Reproduction instructions](../../../scripts/load/README.md) and permanent compiled-artifact hash manifests in [`epic6-load/`](epic6-load/).

The application and simulated clients run in different Node processes. The simulated client uses the production protocol and bounded retry sizes; it does not instantiate the browser `GameClient` or render the UI. Measurements of application CPU and memory exclude the client generator and `cloudflared`. They do not represent total laptop CPU consumption.

## Environment and measurement boundaries

- Apple M3 Pro, 11 CPU cores, 18 GiB RAM; Node 24.22.3. This is **not** the proposed 8 GB reference laptop.
- Owner confirmed the Mac's current uplink was **eduroam** during this session. Public runs used the real owned Cloudflare temporary endpoint, with clients and server co-located on the Mac. Historical physical iPhone-over-cellular checks are separate evidence; they were not repeated as 100 phones here.
- Owned Chrome automation, builds and CPU-heavy suites were paused for final measurements. The small three-client calibration overlapped the beginning of local churn; an advisory registry lookup occurred during the later public window. The shared network and unrelated OS activity were not isolated.
- The server uses production Fastify/Socket.IO, imported JSON validation, projections, request ledger, timers and scoring. No engine-only shortcut supplies results. The host is authenticated through the normal owner exchange; credentials remain in memory.
- Handler timing starts at the Socket.IO command callback and ends immediately before acknowledgement enqueue. It includes synchronous authorization, validation, engine work and broadcasts triggered by that command. It **excludes** network transit and time queued before the callback. Optional instrumentation itself adds work to synchronous broadcasts.
- End-to-end timing runs from simulated-client action to acknowledgement, including queueing, transport and any identical retry. These values must not be described as sub-100 ms internet latency.
- Logical bytes count serialized view/ACK payloads. TCP byte/request counters observe the application↔connector boundary, including HTTP/Socket.IO framing and assets. Compression, framing and queued data mean the two counters are not additive. Neither measures outer TLS/QUIC internet wire bytes or provider-edge requests rejected before reaching the app.
- RSS is sampled every 20 ms; short peaks can be missed. GC snapshots include retained telemetry until the final explicitly recorded collector-clear measurement. No long-duration leak-free claim follows from these short runs.

## Workloads

Every fixture uses author-assigned points: Amber (alias Gold) earns 100; Blue earns 10. Even/odd players choose those answers. With 100 players, the expected final standings contain 50 joint first-place players and 50 at rank 51. Twenty rounds therefore produce totals of 2,000 and 200. Duplicate frequency never changes those points.

| Run | Shape | Concurrency and assertions |
| --- | --- | --- |
| Local churn | 100 players + host; 30 games × 2 rounds; then 60 seconds idle | Asset/session creation in batches of 10; joins in batches of 10; all 100 reconnect concurrently twice; all 100 submit concurrently. 6,000 new accepted answers, 60 exact replay acknowledgements, 3,000 rejected answers and 29 stale old-game attempts. |
| Public mixed | 80 WebSocket + 20 polling players, WebSocket host; 3 games × 20 rounds | Cold assets/sessions in batches of 5; joins in batches of 10; two simultaneous 100-player reconnects. 6,000 new accepted answers, 60 replays, 300 rejected answers and two old-game attempts. |
| Public all-polling, strict burst | 100 polling players + polling host; intended 2 × 20 rounds | All initial admissions succeeded. The first simultaneous reconnect encountered edge 429s and stopped before gameplay. This first version did not apply bounded reconnect recovery to that explicit burst. |
| Public all-polling, bounded follow-up | Same 100 + host and same reconnect concurrency | One follow-up using production-sized backoff/retry limits, retaining every error. Reconnect recovered; gameplay later stopped on one fenced pending answer following DNS failure. No new mutation ID was generated to manufacture success. |

The 101st newcomer was rejected with `GAME_FULL` while existing identities remained admitted. Reconnection assertions verify the same control generation. Every completed game's totals and shared ranks are checked, not just response times.

The local-only pressure test made 300 extra waiting-session admissions, deliberately paced below the separate guest-create-per-second limit. It admitted 255 (one waiting identity already existed), then returned 45 `SESSION_CAPACITY` responses: the intended 256 waiting-session bound. The live 100-player result remained available. A 100-read burst from one admitted player produced 40 `CLOCK` replies and 60 `RATE_LIMITED` replies, preserving that identity. No anonymous overload traffic was sent to the public provider.

## Measured results

| Run | Outcome | App elapsed / CPU seconds | Accepted handler p95 / max | Accepted end-to-end p95 | Sampled peak RSS | Logical socket / origin TCP egress |
| --- | --- | --- | --- | --- | --- | --- |
| Local churn | PASS | 131.1 / 53.36 | 0.45 ms / 81.02 ms | 42.31 ms | 264.4 MiB | 527.1 / 596.1 MiB |
| Public mixed 60 rounds | PASS | 225.0 / 80.58 | 3.55 ms / 403.72 ms | 1546.35 ms | 298.6 MiB | 398.2 / 402.9 MiB |
| Polling strict reconnect | FAIL | 112.2 / 4.79 | — / — | — | 251.8 MiB | 6.9 / 61.6 MiB |
| Polling bounded follow-up | FAIL | 148.9 / 31.45 | 2.87 ms / 407.80 ms | 1771.34 ms | 336.3 MiB | 143.4 / 94.4 MiB |
| Mixed outage + cold burst | PASS | 135.2 / 11.06 | 0.71 ms / 70.18 ms | 587.33 ms | 272.6 MiB | 104.0 / 195.5 MiB |

All measured eligible command groups stayed below the **100 ms processing p95** target, including `JOINED`, `RESUMED`, `STARTED`, permitted invalid answers and accepted answers. This is independent of the FAIL outcome of incomplete all-polling games. For the mixed 60-round pass, join p95 was 20.61 ms, resume 15.96 ms and start 41.24 ms. An accepted-answer transition reached **403.72 ms maximum**, so the p95 must not be presented as a worst-case bound.

Event-loop p95/p99/max were **36.37/76.68/637.01 ms** locally and **11.46/182.19/953.68 ms** in the mixed 60-round public run. The combined outage/disconnect/cold run had **11.28/12.65/2,785.02 ms**. The 2.8-second tail was not isolated to one cause; full-view fanout during connection changes is a plausible contributor and remains a performance investigation item. Suspending the separate connector process is not itself a deliberate pause of the application process.

Local first-game GC heap was 23.38 MiB; after 30 games and idle retention it was 25.38 MiB, including 12,487 retained measurement samples. The final public mixed run retained **27.59 MiB after explicitly clearing command measurement samples**; the separate outage/cold run retained 23.22 MiB. These are observed retained heaps, not proof of absence of a long-term leak. CPU utilization averaged about 40.7% of one core locally and 35.8% in the mixed public run, including startup/idle time; the load generator and connector are excluded.

The mixed public run observed **22 maximum simultaneous origin HTTP requests**, alongside its WebSocket connections, and no HTTP 429 response. The strict and bounded all-polling runs each observed a maximum of 103 origin HTTP requests, while client-side transport errors recorded 45 and 43 edge HTTP 429s respectively. These are different boundaries. Provider rejection happens before the origin counter.

The final combined case passed: 50 answers were locked before suspending the owned connector for 3 seconds; after a further 6-second settle interval the authoritative clock had advanced **9.612 seconds**, the same round remained open and all 50 locks were present. **No socket disconnected during that short interruption**, so no transport resume was necessary in that particular outage case; the separate initial 100-player reconnect test covered resume. All 100 then finished the two-round game at exactly 200/20 points, correct shared ranks, and canonical answer counts.

After the game, all old player sockets were closed and allowed to drain. A new cold-asset wave of the same 100 simulated users loaded HTML, two concurrent JS/CSS resources per user, then the font: **400 HTTP 200 responses, 63,218,000 response bytes, 2.035 seconds**, with zero observed 429s. The client-side HTTP helper reached 196 outstanding requests; the origin in-flight counter is a different, shorter-lived boundary. This is one successful bounded burst, not a guarantee that every link/provider timing stays below the cap. It did not execute 100 actual browser renderers.

Permanent summaries and exact hashes: [rollup JSON](epic6-load/rollup.json), [initial measured build](epic6-load/measured-build-initial.json), [final UI/server measurement build](epic6-load/measured-build-final.json). The root's later integration typecheck added an `unknown` annotation and string guard to diagnostic transport-close reasons; that instrumentation-only compiled difference should be distinguished from the measured gameplay implementation. Full raw sample arrays remain in the working artifacts:

- [Local churn: raw JSON](../../../work/load/local-mixed-100-1794849937557.json).
- [Public mixed 60 rounds: raw JSON](../../../work/load/tunnel-mixed-100-1794850665511.json).
- [Polling strict reconnect: raw JSON](../../../work/load/tunnel-polling-100-1794850957680.json).
- [Polling bounded follow-up: raw JSON](../../../work/load/tunnel-polling-100-1794851273322.json).
- [Mixed outage + cold burst: raw JSON](../../../work/load/tunnel-mixed-100-1794851450096.json).

## What went wrong, and what changed

1. **Harness ingress calibration:** Node `fetch` did not reproduce the explicit local Host-header setup needed by the production origin check; the first calibration returned 403 before playing. The harness now uses `node:http`/`node:https` requests. Node polling also derives its Host header from its URL, so the local harness uses a private DNS lookup agent and matching configured test origin. Production ingress security was unchanged.
2. **Pressure-test calibration:** a three-player calibration generated waiting sessions so quickly that the guest-create-per-second limiter responded before the waiting-slot bound. The local pressure test now uses 5 ms spacing. This isolates the intended capacity bound without changing either production limit.
3. **Strict public runs:** an initial mixed run with connector suspension, and a separate no-fault mixed run, each lost one polling transport and later timed out because the harness disabled recovery. The no-fault run recorded XHR status 0. The exact cause of those earlier two interruptions was not captured; a later DNS finding does not retroactively prove their cause.
4. **Harness recovery and diagnostics:** the harness now records client transport status and underlying error code, server Engine.IO close reasons, identical acknowledgement retries and same-identity resumes. It uses a 2-second ACK timeout with at most two identical retries, and connection backoff at 1/2/4/8/15 seconds. It does not substitute a fresh answer request when an old request has an uncertain outcome.
5. **Clean mixed rerun:** all three 20-round games passed. Three polling ACK timeouts required one identical retry each. There were no unexpected transport disconnects in that rerun and no duplicated scores.
6. **Actual provider headroom finding:** the first all-polling reconnect produced **45 recorded HTTP 429 transport errors**. The bounded follow-up recorded **43 HTTP 429 errors** and recovered the reconnect burst. Provider rejects do not appear in origin HTTP counters, so a modest origin in-flight maximum cannot establish spare provider quota.
7. **All-polling completion still failed:** the bounded follow-up also recorded one Node XHR `ENOTFOUND` DNS lookup failure. There were 44 recoveries overall, maximum approximately 2.54 seconds. All 101 sockets and all 100 identities were present at the final snapshot. However, one unacknowledged answer was fenced by the later resume operation and returned `STALE_REQUEST`; the strict expected-score game test stopped during approximately the 15th round. The fence is working as specified. The production UI reads authoritative state after reconnect and lets the player explicitly submit again while time remains when no answer is locked; it does not automatically resubmit an uncertain answer with a new ID. This is a network/client recovery boundary that needs further investigation, not evidence that the scoring engine lost accepted points. The run did **not** reach its planned connector-injection or cold-burst cases.

8. **Final integration check:** the wider typecheck caught an implicit-`any` parameter in the new private transport-close observer. The coordinator annotated it as `unknown` and emits only a string or `UNKNOWN`. This fixes diagnostic typing/sanitization and does not alter gameplay.

No core scoring, timer or admission rule was altered to make these runs pass. The load work changed private measurements and the test harness. Other Epic 6 UI/distribution changes are covered by their separate evidence.

## Bandwidth and event implications

The final mixed build's JS, CSS and font total 631,661 bytes per player before response headers: approximately **60.2 MiB for 100 cold clients**, plus HTML and setup requests. These assets were actually fetched through the public endpoint, not skipped by the harness.

The mixed 60-round run produced approximately 398 MiB of logical socket payload and 403 MiB at the origin TCP boundary, including initial assets. One middle 20-round game, without its initial cold-download wave or the explicit reconnect bursts, increased the origin byte counter by 116,109,776 bytes over approximately 40.34 seconds: **about 23.0 Mbit/s average during that intentionally accelerated game**.

For an illustrative 20-round event using 3/25/10-second phases, 760 seconds would be available if every answer phase used its full timer. Spreading that same middle-game byte volume across 760 seconds yields about **1.22 Mbit/s average**, or about **1.89 Mbit/s** when one 100-client cold asset download is also amortized across that interval. This is a model, not a measured venue requirement: early completion shortens the interval, and more widely spaced answers can trigger more complete-view broadcasts. Peaks are higher than the average. There is no measured physical-wire peak or guaranteed minimum uplink speed in this evidence.

Full role-filtered snapshots preserve the specified simple protocol, but the measured traffic is substantial. Future work should consider projection/broadcast improvements against the protocol contract, and repeat measurement before making a lower bandwidth claim. No protocol/duration/player-limit change was made here.

Cloudflare documents a 200 in-flight request cap and development/testing positioning for Quick Tunnels: [official Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). One hundred polling clients plus host, old outstanding polls, reconnect POSTs and health checks can overlap that budget. The observed 429s are consistent with that documented constraint; origin counters cannot reconstruct every edge request. A clean mixed run does not establish unlimited free-provider headroom.

## Remaining limits and next checks

- 100-player mixed transport passed on this Mac/uplink; the complete all-polling scenario remains unqualified. A provider/capacity decision or further bounded browser-based investigation is required before promising that mode at events. Do not silently lower the documented 100-player target to hide this result.
- Node simulated polling uses a different HTTP/DNS implementation from real mobile browsers. The `ENOTFOUND` path needs actual-browser/venue investigation. The report preserves both successful bounded reconnect and the later failed action.
- CPU measurements exclude `cloudflared`, the launcher and host browser. The 18 GiB M3 Pro result is not an 8 GB/other-CPU certification.
- This is 30-game churn and a 60-second idle retention interval, not an overnight soak. Existing deterministic tests cover waiting expiry, eight-page eviction, 128 pending handshakes, ledger expiry/fencing, removed identities, restart and lost/late host response ordering. They must remain identified as deterministic tests rather than all being claimed as live 100-player internet fault injections.
- Physical Android/iOS, alternate desktop browsers, Windows/Linux/Intel host platforms, Wi-Fi-off phone flows during this new run, full OS internet loss, actual connector process crash, and long venue endurance remain separate checks. Earlier evidence and root's final suite results are linked from the main Epic 6 report.
- S01–S03 should be read with these explicit scope limits. Processing p95 passing is only one capacity criterion; it does not erase provider/network completion failures.
