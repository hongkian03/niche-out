# Compiled game capacity checks

## Simulate an authored game

```sh
npm run build
node scripts/load/run.mjs --tunnel --pack=examples/game.singapore.json --players=100 --games=1 --transport=mixed --no-reconnect-burst --answer-delay-ms=2000 --answer-spread-ms=18000 --diagnostics=light --label=singapore-capacity --out-dir=work/singapore-capacity/my-run --uplink=eduroam
```

`--pack` loads the file's prompts, aliases, tiers and timers; it controls round count and defaults to one game. The uploaded JSON is whitespace-compacted without changing its authored content. Players cycle through each prompt's valid answers; alternating players use an explicit alias when present. Expected totals/ranks and canonical counts are checked independently against the JSON. `--rounds` and synthetic fault injection are unavailable with a pack file.

`--answer-delay-ms` and `--answer-spread-ms` pace valid submissions after all players observe Answering; their sum must precede the pack's answer deadline. `--no-reconnect-burst` omits the synthetic mass reconnect. The first round still includes invalid-answer/retry checks and each round replays one accepted request. The original synthetic workload remains the default when no pack is supplied. Use a fresh output directory and your actual uplink label.

The [recorded Singapore capacity run](../../docs/implementation/evidence/SINGAPORE-CAPACITY.md) includes per-transport latency, server/connector resources, traffic and final score verification. These Node clients do not emulate rendering or periodic browser clock samples.

Run from the repository root with the pinned Node version. Build first. The harness forks the **compiled production application** into a separate process; simulated Socket.IO clients run in the parent. This separates application CPU/heap from the load generator. The public variant creates and closes its own managed temporary tunnel. It does not accept an arbitrary target URL.

```sh
npm run build
node scripts/load/run.mjs --players=100 --games=30 --idle-seconds=60
node scripts/load/run.mjs --tunnel --players=100 --games=3 --rounds=20 --uplink=eduroam
node scripts/load/run.mjs --tunnel --transport=polling --players=100 --games=2 --rounds=20 --fault --fault-cycle=1 --cold-after --uplink=eduroam
```

The second/third commands need internet access and the repository's pinned `cloudflared` setup (`npm run setup:tunnel` if missing). They generate real traffic through the selected provider; use only your own hosting session. Never run simultaneous benchmark invocations when comparing CPU/latency results.

- `--transport=mixed` (default): 80 WebSocket / 20 polling players at 100 players, plus WebSocket host. `polling` forces **every** connection, including host, to poll. `websocket` uses WebSocket throughout.
- Player/session/asset setup is batches of 10 locally, 5 publicly. Lobby joins are batches of 10. Reconnects and accepted submissions launch all players concurrently.
- `--players=1..100`, `--games=1..30`, `--rounds=1..20`. Generated fixture assigns Amber/Gold 100 points and Blue 10 points; even/odd players receive those fixed values irrespective of counts. Each round also replays one successful request exactly.
- The first round of each game submits one invalid answer per player before valid submissions. Games after the first also replay a stale old-game answer. The 101st membership is rejected when testing 100 players.
- Local-only overload checks fill 256 waiting-session slots using 300 additional admission attempts and send one bounded 100-read burst from a single admitted player. These are never sent through the public tunnel.
- `--fault --fault-cycle=N` suspends only this harness's connector for 3 seconds after half the players lock their answers in round one. It checks the running timer, same identities/control, and retained locks after recovery; unsubmitted players then submit normally. It does not turn off the machine's internet or kill another hosting process.
- `--cold-after` first closes the simulated player sockets and lets polling requests drain, then makes 100 simultaneous HTML reloads. Each loads JS/CSS concurrently and the font afterward. This measures the cold asset request burst; it does not launch 100 browser renderers.
- Unexpected disconnects use at most five reconnection attempts at 1/2/4/8/15 seconds and same-page `game.resume`. Acknowledgements use the protocol's 2-second timeout and at most two identical retries. All transport errors, recoveries and retries remain in evidence. No fresh mutation ID is substituted to hide an unknown outcome.

Results are written to `work/load/*.json`, including failures. Private owner URLs/cookies, player credentials and public tunnel hostnames are not included. Metrics distinguish server entry→ack enqueue latency, client end-to-end time, logical application payload bytes and app↔connector TCP bytes. The latter are **not** internet wire/TLS/QUIC bytes or authoritative provider-edge request counts. Peak RSS is sampled at 20 ms; GC snapshots include the measurement collector until the final explicit collector-clear measurement. CPU covers the application process, excluding the load generator and connector.

The detailed interpretation and remaining limits are in [Epic 6 load evidence](../../docs/implementation/evidence/EPIC-6-LOAD.md). A passing script does not certify 100 physical devices, a different laptop, venue uplink, or unlimited free-tunnel capacity.

## Networking baseline investigation

The baseline suite runs jobs **serially** and compares instrumentation overhead before any networking optimization. It preserves failed runs. Use the pinned runtime and build first; close unrelated browser automation and avoid compiling/compressing files during measurements.

```sh
node scripts/load/baseline.mjs --plan --uplink=eduroam
node scripts/load/baseline.mjs --local-only --out-dir=work/network-baseline/local --uplink=eduroam
node scripts/load/baseline.mjs --public-only --out-dir=work/network-baseline/public --uplink=eduroam
```

Replace `eduroam` with the connection actually used. Each output directory should be new for the campaign. Local jobs are counterbalanced `off → light → detailed → detailed → light → off` (100 WebSocket players, two games × five rounds), followed by a 100-player polling run. Public jobs are one 20-round game each for mixed and all-polling, with a fresh application-owned endpoint per job. These are baseline investigations, not the full release qualification workload. A suite returns exit status 1 if any job fails and still writes its results.

Direct run options added for investigation:

- `--diagnostics=off|light|detailed` (alias accepted by the child: `--instrumentation`): off omits all app diagnostic callbacks and upstream instrumentation; light measures commands/transports without extra payload serialization; detailed also profiles projections, publications, emit enqueue, and diagnostic byte serialization. Missing off-mode handler/byte measurements are unavailable, not zero.
- `--out-dir=path` and `--label=short-label` retain named raw results.
- `--skip-pressure` omits local metadata/rate-limit pressure when comparing identical instrumentation workloads.

Each report captures Git revision, dirty-tree content hash, lockfile/build identity, fixture/workload digest, actual successful transport openings, stage checkpoints, failed-action elapsed times, retries and transport error categories. Successful-action percentiles do not include failures; inspect both. The fixture/workload hash excludes diagnostic mode so matching shapes can be compared across overhead runs. The opening timeout now matches the browser client's 10 seconds, but forced Node transports still do not test browser negotiation.

Snapshots no longer force garbage collection. Stage `liveHeapBytes` values are live observations; only the explicit end-of-workload collector clear/GC is a post-GC measurement. Event-loop histograms are per stage; do not average their percentiles into a supposed global p95. Detailed profile groups can nest (for example publication contains projection/emit); do not sum inclusive timings.

A suite directory contains:

- `suite.json`: planned/executed commands and exit statuses.
- `*.log` and per-run `*.json`: retained outcomes and raw diagnostic evidence.
- `REPORT.md`: readable comparison and stage tables.
- `rollup.json`: compact machine-readable comparison.

Regenerate the report without running traffic:

```sh
node scripts/load/summarize-baseline.mjs --dir=work/network-baseline/local
```

The application process's CPU/RSS excludes the generator and connector. Generator metrics are recorded separately; connector `ps` sampling is labelled with its interval and freshness and excludes the native guard. No arbitrary external target can be supplied. Request/transport errors are recorded without publishing cookies, owner links or tunnel hostnames. Cancelling a direct run writes an ABORTED report and requests shutdown of its owned child; the suite also enforces a bounded deadline.
