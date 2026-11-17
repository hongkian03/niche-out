# Networking investigation baseline

Baseline campaign started November 16, 2026 (America/New_York). This is the first networking investigation chunk, before retry, transport, snapshot, or provider optimizations. The existing Epic 6 evidence remains historical evidence; this report does not replace its failed runs with later successes.

## Findings first

**The baseline found a polling acknowledgement-latency failure independently of the earlier recorded DNS/429 failure, substantial repeated global publication, and growing view-generation cost as round history accumulates. It also found that detailed instrumentation materially disturbs the measurements.** A separate actual-browser recovery probe passed all five checks. None of the proposed networking optimizations has been implemented.

Start with the [generated nine-run tables](../../../work/network-baseline/measured/REPORT.md), then inspect the [permanent compact measurements](network-baseline/summary.json). The generated report links each raw JSON and runner log. The failed run is retained alongside the passes, rather than replaced by a retry. The light-instrumentation provider follow-up is recorded separately below.

| Workload | Outcome | Accepted handler p95 | Accepted client E2E p95 | ACK retry entries |
| --- | --- | ---: | ---: | ---: |
| Local 100 WebSocket, application diagnostics off, two repetitions | Both pass | Unavailable by design | 72.00 / 74.14 ms | 0 / 0 |
| Local 100 WebSocket, light diagnostics, two repetitions | Both pass | 0.99 / 0.96 ms | 88.65 / 77.26 ms | 0 / 0 |
| Local 100 WebSocket, detailed diagnostics, two repetitions | Both pass | 0.99 / 0.93 ms | 84.36 / 81.46 ms | 0 / 0 |
| Local 100 polling, detailed, ten rounds across two games | Pass | 0.91 ms | 565.49 ms | 0 |
| Public 80 WebSocket / 20 polling players + WebSocket host, detailed, 20 rounds | Pass | 3.75 ms | 2,525.53 ms | 162 |
| Public 100 polling players + polling host, detailed, intended 20 rounds | **Fail in round 17** | 2.96 ms for successful accepted ACK samples | 3,557.33 ms for completed accepted actions | 287 |
| Separate public 100 polling players + polling host, light, intended 20 rounds | **Fail in round 10** | 1.85 ms for successful accepted ACK samples | 1,393.85 ms for completed accepted actions | 7 |

All completed local comparison games assert scores, tied ranks, canonical counts and replay safety. Each local comparison has 1,000 unique accepted answers plus ten explicit duplicate acknowledgements. The successful public game has 2,000 unique accepted answers plus 20 explicit duplicates; internal retry handler counts must not be mistaken for additional players or answers. Every run also tests refusing the extra newcomer and restoring admitted identities while full.

### 1. The new polling failure is not the old DNS failure

In the detailed public polling run, accepted-action round p95 increased from approximately 0.77 seconds in round 1 to 3.90 seconds in round 14 and 5.24 seconds in round 16. During round 17, two answer actions exhausted approximately **6.00 seconds** across the original ACK attempt and two identical retries. A third pending action was cancelled when benchmark cleanup disconnected sockets; that cancellation is not a third independent networking fault.

No client-recorded 429, DNS error or recovery occurred in this run. At the final snapshot, the server still reported **100 players and 101 Socket.IO connections**. Server Engine.IO logs do contain close reasons, including ping timeouts and a transport error; these can include older transports draining after explicit reconnects, and the aggregate trace does not establish which close belongs to the failing action. Therefore the report does not claim that every transport was healthy.

The server recorded accepted processing during the failing stage. A fast handler p95 only measures time after the handler starts; it excludes pre-handler queueing, queued outbound traffic, browser/network delivery and additional publication work between callbacks. The exact bottleneck behind the missing acknowledgements remains to be isolated. Increasing timeouts alone would conceal the delay rather than explain it.

The successful mixed run also needed **162 polling answer ACK retries**, with no WebSocket retries recorded. It finished with correct scores, but the retry count and 2.53-second E2E p95 show pressure even in a passing run. These counts describe this workload, not 162 distinct affected people.

**Light follow-up:** after the nine-run suite and browser probe, one fresh polling-only run used light diagnostics with the same 20-round fixture and compiled server. It recovered one edge 429 during reconnect in approximately 2.61 seconds. Later, in round 10, an answer exhausted approximately **6.004 seconds** of identical ACK attempts. The run retained seven ACK retry entries, no recorded DNS failure, and a final snapshot of 100 players/101 sockets. Successful accepted-action p95 was 1.394 seconds; that percentile excludes the failed action. Application CPU was 18.40 seconds over the full measured application lifetime, and sampled peak RSS was approximately 380.7 MiB. It did not complete the intended game.

This follow-up establishes that detailed profiling is **not the sole explanation** for polling ACK exhaustion. It does not isolate provider transport, socket queueing, server scheduling, or the generator as the final cause. Its one recovered 429 also confirms that quota pressure remains possible with light diagnostics and improved socket cleanup. Different failure rounds and retry counts show that one public run is not a stable latency guarantee. Inspect the [follow-up summary](network-baseline/polling-light-followup.json) and its raw-report link.

### 2. Reconnection creates thousands of global view deliveries

One detailed local reconnect stage recorded:

| Trigger | Global publications | Recipient-view attempts |
| --- | ---: | ---: |
| 100 players disconnecting | 100 | 5,050 |
| 100 players resuming | 100 | 5,184 |

Those publication calls consumed approximately **2.01 seconds of inclusive publication time** in that stage. A later reconnect stage recorded about 1.84 seconds. One 100-player admission stage generated 100 publications and 10,100 recipient-view attempts, because all waiting sockets were already connected.

These are application view deliveries/attempts, not equivalent HTTP requests. Engine.IO can combine packets. The measurements directly establish repeated global fan-out; they do not prove that every publication can be removed without affecting another player's readiness or connection display.

### 3. History-dependent snapshot construction is a strong source candidate

Source review found that `GameEngine.state()` copies and freezes players and all accumulated rounds, submissions, points and results. The already-frozen compiled answer objects are reused. Authentication, membership, control validation and projection repeatedly call this method; a typical successful player-view path performs approximately **eight snapshots per recipient**.

In the detailed public mixed run, comparing only Answering-phase player projection wrappers:

| Round | Mean player projection-wrapper time | Average serialized player view |
| --- | ---: | ---: |
| 1 | 0.340 ms | 12,156 bytes |
| 10 | 1.490 ms | 12,359 bytes |
| 20 | 2.717 ms | 12,412 bytes |

The wrapper grew about **8×** while its outgoing payload grew only about **2.1%**. This supports investigating accumulated-history copying and repeated validation, rather than attributing the entire delay to bigger network messages. The wrapper includes authorization/control/projection/schema work; it is not an isolated timer for `state()` and does not establish the sole cause of the public polling failure.

### 4. Detailed diagnostics add material overhead

| Application diagnostic mode | Mean application CPU across two runs | Relative to off |
| --- | ---: | ---: |
| Off | 9.17 seconds | Baseline |
| Light | 9.37 seconds | Approximately +2.1% |
| Detailed | 11.89 seconds | Approximately +29.6% |

The detailed accepted-action E2E p95 averaged approximately 13.5% higher than off. These are descriptive two-run comparisons, not statistically established percentages for all workloads.

The first detailed profiler itself calls `engine.state().phase` to label each timing event. That adds approximately four snapshot copies per successful player-view delivery and one per publication. Consequently, inclusive outer profile/publication costs contain observer-induced history-copy work as well as production work. The inner `player-projection` timer ends before its own phase-label snapshot, but outer timers include nested observer work. Extra JSON serialization is also measured separately; it is not the only diagnostic overhead.

**Use light mode for capacity comparisons and detailed mode for attributed investigation.** A future profiler refinement should obtain phase labels from already available state instead of creating another snapshot. The detailed public failure alone must not be advertised as the exact uninstrumented production cost; the light provider follow-up is necessary context.

### 5. Long event-loop delays also occur with application diagnostics off

The two off-mode local runs recorded reconnect-stage maximum event-loop delays of approximately **695 ms and 681 ms**. Detailed local runs reached approximately 921–946 ms. The public mixed run reached **1,243 ms** during reconnect and approximately **1,094 ms** during a late submission stage.

This campaign did not reproduce the historical 2.8-second maximum, and it removed explicit GC from active intervals. The smaller repeated reconnect stalls still exist without detailed application instrumentation, so they cannot all be dismissed as the observer. Maxima identify where to profile next; these stage measurements do not isolate one function as the cause.

### 6. The actual-browser recovery contract works in the tested cases

Fresh Chrome **157.0.8103.79**, phone-size player contexts, production server/client and an owned temporary tunnel passed:

1. Actual polling startup followed by a completed WebSocket upgrade.
2. Server accepts an answer; test drops its matching ACK and closes that player's transport; the accepted lock returns after reconnection.
3. An unsubmitted draft freezes offline and returns without automatically submitting.
4. An outgoing answer is dropped before server delivery; after reconnection the UI says **“No answer is locked. You can submit again while time remains.”** No automatic fresh-ID answer is sent.
5. An explicit new Submit completes both rounds with both players on exactly 200 points.

The configured state-withholding gate saw no state frame before the accepted ACK was dropped; this run demonstrates dropping the ACK before a resulting view arrived, not an observed withheld-view event. It is controlled browser fault injection, not a real DNS/provider outage.

Inspect the [browser timeline and result](network-baseline/browser-report.json), [accepted-answer screenshot](network-baseline/accepted-after-recovery.png) and [unaccepted-answer screenshot](network-baseline/unaccepted-after-recovery.png). The full four screenshots remain in `work/network-baseline/browser-1794887177893/`. Startup took approximately 82 seconds to reach endpoint readiness; total probe duration was approximately 107 seconds. All five checks passed; all 26 observed polling HTTP responses were 200.

## Build and evidence integrity

All nine suite jobs, the light follow-up and browser probe used compiled server SHA-256 `5375ccb88cdeb87a78f4334fe4be7bb3513e38a7ba885d6e79ae880881cd0105`. All nine suite jobs used the same dependency lock; all six overhead runs used identical fixture and workload-shape hashes. Documentation edits can change the working-tree source digest between jobs without changing the measured binary; each raw report retains both.

The full raw reports remain under `work/network-baseline/measured/`; the permanent compact summary retains their digests, per-stage results, profile aggregates, process resources and failures. Application CPU/RSS excludes the load generator, connector and browser. The sampled connector resource scope excludes the native guard and discloses sampling age. No physical-phone, other-host-platform, clean release or multi-hour endurance certification follows from this baseline.

## Purpose and scope

The question is where time, traffic, and failures arise in the current application. Three parallel agents implemented measurement/collector support, workload/report tooling, and independent review/browser reproduction. The coordinator reviewed the integration, ran the regression checks, and scheduled benchmarks sequentially to avoid test jobs competing with each other.

No scoring, timing defaults, player limits, transport order, retry policy, or provider selection was changed. Production changes are optional private diagnostic instrumentation. Harness corrections include request-counter deduplication, socket cleanup, failure attribution, and explicit garbage collection outside measured stages.

## Environment and reproducibility

- Starting source commit: `1399c26c027de2140575b4e167ff5a9fa1a0f6e5` (`updated README`). The diagnostic additions are working-tree changes; every run records its actual source-tree and compiled-server hashes rather than pretending the commit alone identifies the measured code.
- Available host: Apple M3 Pro, 11 cores, 18 GiB RAM, macOS 26.5.2 build 25F84; Node 24.22.3 and npm 11.19.1.
- The owner confirmed **eduroam** for this campaign. Public clients and server run on the same Mac and communicate through the owned public Cloudflare endpoint. This is not independent cellular/venue or 100-physical-phone evidence.
- The generated pack assigns Amber/Gold 100 points and Blue 10 points. Valid duplicates never alter assigned points. Reading/results use 0.2 seconds and answering ends early when everyone submits. This intentionally accelerated fixture is not an event-duration bandwidth measurement.
- Local overhead sequence: diagnostics **off → light → detailed → detailed → light → off**, two games of five rounds per run, 100 WebSocket players plus host. A separate local polling run and two public 20-round mixed/polling runs follow. Each application is fresh; jobs are serial.

Two repetitions per mode expose variability, not statistical significance. Off disables application diagnostics but retains harness/resource observation and the current code's inactive instrumentation branches; it is not an unmodified historical executable. Light records handler/transport counters; detailed adds nested view/publication profiling and extra JSON byte measurements.

## How to read the evidence

| Question | Evidence |
| --- | --- |
| Did the game complete with correct scores? | Run `status`, `checks`, `failures`, `failedActions`; every finished game asserts totals, ranks, canonical counts and duplicate replay behavior. |
| Where did a failure occur? | Stage-labelled errors and timestamps, underlying DNS/status codes, retries and reconnect records. |
| Did server work or the connection take time? | Handler entry-to-before-ACK measurements separately from client end-to-end timings. Event-loop queueing before handler entry is excluded from handler timing. |
| What generated traffic? | Projection, publication and extra diagnostic serialization profiles by stage/cause/role; logical bytes separately from origin TCP bytes. |
| Did the observer alter the workload? | Counterbalanced off/light/detailed runs; compare repeated costs and variability rather than relying on a single ratio. |
| What did a real browser do? | Separate fresh-Chrome production-client recovery probe, screenshots and sanitized network timeline. Forced Node transports are not browser negotiation. |

The [independent review](NETWORK-BASELINE-REVIEW.md) explains the measurement limitations and exact raw fields. Profile groups are nested and inclusive: **do not sum projection, emit, serialization and publish totals**. Emit measures synchronous Socket.IO work, not arrival at the phone. Diagnostic JSON serialization is additional observer work.

## Verification before measurement

- Workspace typecheck and complete production build passed.
- Small three-player calibration completed two rounds, replay and reconnect checks.
- All **433 application tests in 32 files** passed, including two new tests checking diagnostic safety and exact polling-request accounting.
- All **three collector/parser checks** passed.

Logs: `work/network-baseline/build.log` and `work/network-baseline/calibration-and-tests.log`. These correctness checks finished before the quiet capacity runs.

After measurement, a harness-only diagnostic sanitizer was added and **four focused redaction checks** passed, alongside another pass of the three collector checks. It redacts URL/credential/page/request details in exception and console output. This does not change the compiled server, retries or workload; original evidence was preserved. All owned baseline servers, browser probes, connectors and native guards were absent at the final process cleanup check. No packages were rebuilt, no provider was switched, and no commit or push was performed for this investigation.

## Measurement corrections from the earlier campaign

1. Polling HTTP requests could pass through two observation hooks. A WeakSet now counts each actual request once; previous request counters are not directly comparable to these corrected counters.
2. Earlier snapshots forced GC within the cumulative measurement. Current snapshots report live memory; final explicit GC has its own duration and lies outside active event-loop intervals.
3. Failed connection managers could outlive the generator's current socket reference. The runner now owns and disposes every attempted socket, and preserves errors instead of relying only on successful ACK percentiles.
4. Earlier forced-client opening timeout was 20 seconds; it now matches the browser's 10 seconds. The generator still does not execute the browser's complete recovery logic, and its internal resume ACK path must be interpreted separately.
5. Empty stage histograms report null, not misleading sentinel percentiles. Stage markers involve coordinator IPC; already scheduled readiness publications can cross a marker.

These are benchmark corrections, not evidence that provider failures vanished or the production networking issues were fixed.

## Reproduce and inspect

From the repository root, using the pinned runtime:

```sh
npm run build
node scripts/load/baseline.mjs --plan --uplink=eduroam
node scripts/load/baseline.mjs --out-dir=work/network-baseline/my-run --uplink=eduroam
```

The actual run creates its own application/tunnels, prints each job's start/end, and writes `suite.json`, `REPORT.md`, `rollup.json`, logs and individual raw JSON files in the selected directory. Use a fresh output directory for each campaign. Keep other benchmark/browser/build jobs idle. Provider jobs require internet and the verified connector; use `--local-only` for loopback-only measurements or `--public-only` for the two provider cases. Inspect failures even if the suite proceeds to its next planned job.

To reproduce the additional light polling-only comparison:

```sh
node scripts/load/run.mjs --tunnel --players=100 --transport=polling --games=1 --rounds=20 --diagnostics=light --label=public-polling-light --out-dir=work/network-baseline/my-light-run --uplink=eduroam
```

The actual recorded suite has **eight passing and one failing capacity job**, followed by the separate failing light polling job. The failure is a measured finding, not a reason to keep restarting until a green run appears. The main suite intentionally continues its planned independent jobs and reports `FINDINGS`/nonzero exit when any fails.

Run the separate production-browser probe after capacity measurements stop:

```sh
node scripts/load/browser-baseline.mjs
# To watch the automated browser steps:
node scripts/load/browser-baseline.mjs --visible
```

The browser probe injects faults only into its own fresh test browser and shuts down its own tunnel. Its report and player screenshots are written under `work/network-baseline/browser-*/`. It must not be called a real provider outage or DNS reproduction.

## Relation to the networking worklist

| Issue | Baseline contribution | Still requires subsequent work |
| --- | --- | --- |
| N1: provider headroom | Reconnect-stage edge errors and origin counters, with corrected request accounting | Retry/transport/provider changes and qualification after those changes |
| N2: DNS and interrupted submission | Structured error codes plus actual-browser before/after-acceptance fault boundaries | Root cause of external DNS failures; actual venue/browser reproduction |
| N3: snapshot traffic | View/publication counts, bytes and costs by trigger | Remove unused data and redundant publications, then compare |
| N4: latency tails | Per-stage event-loop histograms, profile maxima, diagnostics-overhead comparison | Isolate remaining stalls with focused profiling before claiming a cause |
| N5: synchronized activity | Current fixed policy frozen; actual browser polling/WebSocket evidence separate | Jitter, explicit WebSocket-first fallback and staggered clock sampling |
| N6: missing qualification | Exact available-host workload and declared browser boundaries | Physical devices, other hosts, long endurance and actual event network |

## Recommended next investigation from this baseline

The first targeted performance work should measure and reduce repeated state snapshots and global reconnect publications, while preserving authorization, immutability and complete role-filtered views. This is more specific than attributing every delay to internet transit. Obtain profiler phase labels from already available state to avoid observer-induced snapshots before using detailed timings as a precise production cost estimate.

Retry jitter and tested WebSocket-first fallback remain useful proposed connection work. They do not eliminate all-polling request pressure. Keep the historical DNS cause open, retain the new light-mode ACK failure, and repeat the same hashes/workload boundaries after each chosen fix. No provider or player-limit decision is silently made by this report.
