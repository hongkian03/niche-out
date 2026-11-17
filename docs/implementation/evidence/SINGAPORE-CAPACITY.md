# Singapore game at current capacity

Run November 17, 2026 (America/New_York), after the owner cancelled the proposed 200-player planning extension and requested a simulated game using the Singapore example. **Result: PASS at the existing 100-player limit.** No game-engine, provider, transport policy or admission-limit changes were made.

## What ran

- Actual compiled production server and its own managed Cloudflare Quick Tunnel, with the Mac on owner-confirmed eduroam.
- Apple M3 Pro, 11 cores, 18 GiB RAM; macOS 26.5.2, Node 24.22.3/npm 11.19.1, pinned cloudflared 2026.11.0.
- [Singapore example](../../../examples/game.singapore.json): all ten prompts and original 3-second reading, 25-second answering and 10-second results settings. Source file was unchanged. JSON whitespace was compacted by the upload helper (39,600-byte source, 20,733-byte equivalent upload).
- 100 Node Socket.IO simulated players: 80 forced WebSocket and 20 forced polling, plus a WebSocket host. These clients fetch HTML, JS, CSS and font resources; they do not render 100 browsers or emulate browser transport negotiation.
- Valid answers and aliases chosen deterministically from each prompt's own answer list, with expected totals and canonical counts computed independently from JSON tier assignments. Submissions spread across approximately seconds 2–20 after all clients observe Answering; early phase completion remains normal game behavior.
- First round also included 100 rejected-answer attempts followed by valid submissions. Each round replayed one already accepted request to check duplicate safety. An extra newcomer was refused with `GAME_FULL`.
- Light diagnostics, no injected outage, no forced reconnect storm, no separate overload flood. Source/settings and workload hashes are retained in the evidence.

The pack-file path and pacing support were added to the existing harness, with two focused scenario checks and local pack/synthetic calibration runs before the public run. The public measurement was a single run, not repeated until passing.

## Game outcome

All **1,000 unique answers** were accepted, plus ten exact duplicate acknowledgements. All 100 final totals and competition ranks matched independent expectations, and every round's canonical answer counts and assigned points were checked. Totals ranged from **235 to 605**; simulated player P98 won with 605. There were **zero recorded ACK retries, zero client transport errors, and zero recovery attempts**. All 100 players and 101 application sockets remained present at the final snapshot.

The extra newcomer's deliberate disconnect is recorded separately. Lower-level server Engine.IO events include opens/closes and one transport-error close; these events are not correlated to individual authenticated players, so this report does not claim every underlying transport had zero errors. No participating client's connection error/disconnection or recovery was recorded.

## Connection and latency measurements

| Measurement | Result |
| --- | ---: |
| Temporary public endpoint ready | 80.44 seconds |
| Start through observed Finished | 337.48 seconds (about 5 minutes 37 seconds) |
| Entire runner including setup/shutdown | 449.68 seconds (about 7 minutes 30 seconds) |
| Accepted-answer server handler p95 / maximum | 2.09 / 195.51 ms |
| WebSocket accepted-answer E2E p50 / p95 / maximum | 50.26 / 199.77 / 537.91 ms |
| Polling accepted-answer E2E p50 / p95 / maximum | 314.26 / 498.40 / 1,204.61 ms |
| WebSocket join E2E p95 | 182.88 ms |
| Polling join E2E p95 | 618.42 ms |
| Maximum observed stage event-loop delay | 396.62 ms |

Server handler timing starts at the callback and ends before ACK enqueue. It excludes earlier queueing and internet transit. Client E2E covers the complete send-to-ACK path. WebSocket accepted samples total 800; polling samples total 210 because that group includes the ten explicit duplicate replays. These are separate measurement boundaries and denominators.

The processing p95 target passed for all measured eligible command groups. This does not imply every individual handler was below 100 ms or every network round trip was instantaneous.

## Host and tunnel resources

| Measurement | Result |
| --- | ---: |
| Application CPU time | 127.86 CPU-seconds over about 439 measured application seconds |
| Application sampled peak RSS | 297.97 MiB |
| Application used heap after final explicit GC | 27.05 MiB |
| Connector sampled CPU time | 21.17 CPU-seconds |
| Connector sampled peak RSS | 61.16 MiB |
| Application-origin TCP bytes written | 1,152,476,103 bytes, about **1.07 GiB** |
| Application-origin TCP bytes read | 15,252,291 bytes, about 14.55 MiB |
| Approximate game-only origin egress | **1.01 GiB** after initial assets/admission |
| Approximate game-only origin average egress | **25.74 Mbit/s** over the measured game interval |

Application CPU averaged about 29% of one core across startup/setup/game time; it excludes the generator, connector, native guard and browser. It is not the whole laptop's CPU percentage. Connector CPU/RSS is sampled separately with `ps`; native guard usage is excluded. Memory is process RSS rather than a reserved memory requirement or leak guarantee. Explicit final GC occurs outside active measurement intervals.

**The traffic is the main remaining cost in this passing run.** Staggered answers can generate far more separate readiness publications than a synchronized burst, because many updates fall outside the 50 ms batching window. Current full-view publication and repeated snapshot work remain unchanged. This is an explanation supported by the current design, not a measured per-message attribution in light mode.

Origin TCP counters observe the application-to-connector boundary and include HTTP/WebSocket framing and assets. They exclude outer TLS/QUIC overhead and are not authoritative provider billing or internet-wire measurements. Compression and provider behavior can change actual uplink bytes. The 25.74 Mbit/s figure is an origin-boundary average for this workload, not a minimum internet-speed recommendation.

## HTTP and WebSocket observations

- The harness's 507 ordinary asset/API HTTP requests all returned **200**. This counter excludes Socket.IO's internal polling requests.
- The application observed **21,133 HTTP requests**, including polling, asset/API traffic and health checks. The maximum observed concurrent non-upgrade HTTP requests was **21**.
- It observed **83 HTTP upgrades**. Successful simulated Socket.IO openings were 82 WebSocket and 20 polling: 80 WebSocket players + host + the deliberately refused extra newcomer, and 20 polling players. Openings are not a claim of 102 admitted players.
- No provider 429, DNS error or ACK timeout was recorded by simulated clients. This mixed-mode run does not qualify 100 polling-only players, a reconnect storm, or a 200-player mode.
- Non-upgrade HTTP concurrency is separate from WebSocket connections and provider-edge accounting. A maximum of 21 at the origin does not establish 179 unused provider request slots.

## Round-by-round indicators

| Round | Accepted-stage CPU seconds | Client ACK p95, combined transports | Maximum event-loop delay |
| --- | ---: | ---: | ---: |
| 1 | 5.29 | 439.53 ms | 72.02 ms |
| 2 | 6.75 | 380.41 ms | 94.11 ms |
| 3 | 8.15 | 323.17 ms | 97.52 ms |
| 4 | 9.98 | 325.35 ms | 111.41 ms |
| 5 | 11.78 | 345.49 ms | 136.58 ms |
| 6 | 13.49 | 372.35 ms | 264.50 ms |
| 7 | 14.26 | 377.96 ms | 300.15 ms |
| 8 | 14.42 | 379.06 ms | 326.89 ms |
| 9 | 14.88 | 417.26 ms | 366.22 ms |
| 10 | 16.24 | 348.94 ms | 396.62 ms |

Most accepted-submit stages last approximately 20.3–20.6 seconds. The final stage also includes the last 10-second result phase before Finished, so its CPU and elapsed interval should not be treated as an identical-duration sample. Combined client percentiles weight 80 WebSocket versus 20 polling players; the transport-specific table is more useful for comparing their behavior.

Server work and event-loop maxima still grow in later rounds. The game completed, but the passing functional result does not eliminate the previously identified accumulated-history/snapshot and publication-efficiency concerns.

## Evidence and reproduction

- [Permanent measurement summary, round metrics and all standings](singapore-capacity/summary.json).
- [Full raw report](../../../work/singapore-capacity/measured/singapore-capacity-light-tunnel-mixed-100-1794892579496.json).
- [Runner log](../../../work/singapore-capacity/game.log).
- Local setup/calibration logs: `work/singapore-capacity/preflight.log` and `calibration.log`.
- Harness changes: [`run.mjs`](../../../scripts/load/run.mjs), [`pack-scenario.mjs`](../../../scripts/load/pack-scenario.mjs), and [`pack-scenario.check.mjs`](../../../scripts/load/pack-scenario.check.mjs).

```sh
# Use the pinned Node runtime from the repository root; build first.
npm run build
node scripts/load/run.mjs --tunnel --pack=examples/game.singapore.json --players=100 --games=1 --transport=mixed --no-reconnect-burst --answer-delay-ms=2000 --answer-spread-ms=18000 --diagnostics=light --label=singapore-capacity --out-dir=work/singapore-capacity/my-run --uplink=eduroam
```

Use your actual uplink label and a fresh output directory. No account/domain purchase or external deployment is needed. A run creates and cleans up its own temporary tunnel and application. These are forced Node clients, not the production browser's clock-sampling, rendering or transport-negotiation workload. Real phones, the future venue, all-polling behavior and long endurance remain separate verification. No capacity promise is increased by this report.
