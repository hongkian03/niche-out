# Epic 6 S02/S03 follow-up implementation and verification

Owner-authorized parallel investigation with coordinator-owned serial measurements. Starting revision: `df2e24a` (`network optimizations and updated readme`). This follow-up preserves the 100-player target, manual tier scoring, deadlines, request identity and managed Quick Tunnel policy. Workload simulation is not a physical-device or 8 GiB-host certification.

## Implementation

- Optional private application command tracing correlates handler entry, ACK enqueue, Engine.IO packet creation/flush/drain and polling HTTP completion with client packet/callback/timeout events. Run-local HMAC tags replace raw request identities; the random key is not persisted. Each side retains at most 50,000 allowlisted trace events. Local flush/drain/HTTP completion does not prove end-to-end delivery.
- Read-only private session/ledger aggregates expose counts, not identities, credentials or answer data. Diagnostic snapshot collection uses one scoped immutable snapshot for membership counting; a test prevents repeated history copying.
- Load harness retention checkpoints summarize timing windows, clear measurement samples and explicitly GC only between games. Processing targets include every retained window, and discarded stage counts are visible.
- A scoped loopback relay permits complete bidirectional app-transport interruption without changing the host computer's network. Recovery scenarios combine response loss, reconnect, accepted locks, deadline preservation, tab takeover, removal and game replacement. Public mode kills its actual owned cloudflared process and checks terminal cleanup.
- Runtime-bound workload exercises full production waiting/page/handshake/cache/admission-history thresholds with 100 active clients. Expiry/refill uses injected logical time except the actual handshake timeout; this is distinct from real-time endurance.
- Import-capacity runner accepts `--out-dir` and records build/importer/core hashes, keeping new and historical evidence separate.

Source references: [application](../../../apps/server/src/game/application.ts), [sessions](../../../apps/server/src/game/sessions.ts), [request ledger](../../../apps/server/src/game/ledger.ts), [load runner](../../../scripts/load/run.mjs), [load server](../../../scripts/load/server.mjs), [trace helpers](../../../scripts/load/command-trace.mjs), [recovery workload](../../../scripts/load/recovery.mjs), [owned relay](../../../scripts/load/recovery-relay.mjs), [bounds workload](../../../scripts/load/bounds-runtime.mjs), [import runner](../../../scripts/test-import-capacity.mjs).

## Verification record

Integrated typecheck and build passed. Application regression suite: **456/456 tests across 34 files passed**. Trace/relay/collector/sanitizer checks: **16/16 passed**. Initial new HTTP metadata fixture omitted the configured Host header and returned 403; corrected fixture passed. No ingress protection was weakened.

The first runtime-bound calibration passed all seven scenarios, including 1,000 total admissions and four replacements. Final compiled-build run is recorded below. The six import cases passed: both examples, representative content, both valid exactly-10-MiB shapes, and one-byte-over-limit rejection. Measurements and provenance are retained separately.

## Serial campaign

Two public polling traces are retained, both ending after 17 verified rounds. The first stopped on a DNS/interrupted-request fence boundary. It also measured two recovered ACK delays: approximately 2,024 ms before server transport flush in one case, and a later client arrival after local flush in another. The second stopped after an answer exhausted three ACK attempts; that command had no corresponding server handler trace. Both trace buffers reported zero discarded events. This demonstrates multiple failure boundaries; it does not identify the provider, DNS, client queue or connector as a single cause. See [correlated run](epic6-followup/polling-correlated.json) and [steady run](epic6-followup/polling-steady.json). No timeout budget, scoring rule or request-fence policy was relaxed.

The public 100-player combined recovery run passed ten checks, including actual owned cloudflared SIGKILL. During teardown review, its retained diagnostics showed one pinned ledger outcome after sessions were cleared. `close()` now explicitly clears the ledger. The final-build local 100-player recovery run passed eight combined-fault checks and confirms zero session/ledger counts after cleanup. Its simulated transport outage preserved the original deadline and accepted locks, while 99 remaining players finished on exactly 200 points after removal.

The final-build runtime-bound run passed all seven cases. Final import measurements passed all six cases. Exact summaries/hashes are linked below. The longer local run **passed**: 30 ten-round games (300 rounds, **30,000 unique accepted answers**, 300 exact replay acknowledgements), 600 seconds of idle heartbeat retention, and out-of-game retention checkpoints every five games. Total duration was **807.40 seconds** (about 13 minutes 27 seconds). Both local waiting/read-pressure cases passed, identities and scores remained correct, and retries/transport errors were zero. All 101 connections survived idle checks. Waiting records expired; final metadata held 101 session records/pages, zero waiting identities, zero pending handshakes, 100 current-game admissions and bounded ledger counts. No stage or command-sample records were dropped.

Retained app heap after five-game checkpoints was **24.26, 24.76, 24.74, 24.94, 25.09 and 25.39 MiB**; final after-idle GC heap was **24.92 MiB**. Peak app RSS was **284.38 MiB**. Accepted-handler p95 across the six windows ranged **1.95–2.28 ms**; all eligible command windows passed the 100 ms target. Maximum measured stage event-loop delay was **288.10 ms**; p95 passing is not a worst-case latency bound. The run is bounded endurance evidence, not a multi-hour leak certification. See [endurance measurements and provenance](epic6-followup/endurance.json).

## Qualification boundaries

The available host remains the 18 GiB M3 Pro Mac. The owner has deferred other-platform checks; no 8 GiB host is available in this session. Relay interruption models loss of app reachability, not a physical OS internet outage. A killed Quick Tunnel process is terminal: the documented flow is stop and fresh hosting, not resurrection of the old public URL. A bounded soak does not establish overnight stability.

No release upload, signing, dependency update, game-rule change or git commit is performed by this follow-up.

## Fixes and their limits

1. **Shutdown cleanup:** clear the private request ledger after session cleanup. Successful pinned replies remain available during a live session; they are discarded when the application closes. This fixes retained metadata in a still-referenced closed application, not a demonstrated process-wide GC leak.
2. **Diagnostic snapshot work:** share one immutable snapshot across aggregate membership counts rather than repeatedly copying history.
3. **Measurement correctness:** earlier retained-window p95 failures now keep the overall processing target failed even when the last window passes or is empty. Regression checks cover missing evidence, exact thresholds and excluded capacity responses.
4. **Fixture correction:** new metadata HTTP fixture now supplies the exact configured Host header; a TypeScript-only cleanup call to a private Socket.IO Manager method was removed. No production authentication rules changed.

The polling investigation added diagnostic capability and located observed failure boundaries; it did not establish or fix a production gameplay defect. S02 stays REVIEW for polling-only completion and 8 GiB-host evidence. S03 gains passing bounds, combined recovery and bounded endurance evidence; its full acceptance remains REVIEW for physical OS/venue internet-loss and longer event-duration qualification. Existing private archives predate this follow-up and must be rebuilt/reverified before being described as containing its changes.

## Evidence index and reproduction

- [Polling trace with reconnect](epic6-followup/polling-correlated.json): recovered ACK delays and DNS/interrupted-request boundary.
- [Polling trace without forced reconnect burst](epic6-followup/polling-steady.json): three timed-out attempts absent from the application handler trace.
- [Recovery and teardown](epic6-followup/recovery.json): actual connector crash plus final compiled-build zero-count cleanup.
- [Runtime bounds and import peaks](epic6-followup/bounds-import.json): full limit assertions and six import cases.
- Raw reports/logs: `work/epic6-followup/`; evidence summaries retain exact raw SHA-256 and build provenance.

Using the pinned Node runtime, build first with `npm run build`. Focused reproduction commands:

```sh
node --test scripts/load/*.check.mjs tests/server/baseline-metrics.check.mjs
node scripts/load/run.mjs --tunnel --players=100 --transport=polling --games=1 --rounds=20 --diagnostics=light --trace-commands --label=polling-investigation --uplink=eduroam --out-dir=work/my-polling-investigation
node scripts/load/recovery.mjs --tunnel --players=100 --uplink=eduroam --out-dir=work/my-recovery-investigation
node scripts/load/bounds-runtime.mjs --out-dir=work/my-bounds-investigation
node scripts/test-import-capacity.mjs --out-dir=work/my-import-investigation
node scripts/load/run.mjs --players=100 --transport=mixed --games=30 --rounds=10 --idle-seconds=600 --retention-every=5 --diagnostics=light --label=endurance --uplink=eduroam --out-dir=work/my-endurance-investigation
```

Run measured jobs serially using fresh output directories; record the actual network if it differs. Public tests own their endpoint and connector. No unrelated provider is flooded, and the relay never changes system network configuration. The one-shot failed polling reports remain failures even when handler processing targets pass.

## Acceptance and manual follow-up

S02 remains REVIEW: complete 100-player polling-only gameplay did not pass either public investigation, and an actual 8 GiB host was unavailable. S03 remains REVIEW with its specified controlled recovery/resource/endurance deliverables recorded; physical whole-OS/venue connectivity loss and longer event-duration behavior are not certified by the relay or the 13-minute campaign. Existing phone/browser and host-platform matrices belong to the later qualification work and are not silently marked passed.

There is no required manual action to validate the delivered cleanup fix: the final production-application regression and 100-player local fault run passed. To extend qualification, run on the intended event network/hardware, record physical interruption/reconnection behavior and repeat the declared event-duration workload. Existing Quick Tunnel and network limitations remain documented. All owned campaign processes/listeners/connectors were shut down by their harnesses. No git commit was made; the owner can review and commit the working tree.
