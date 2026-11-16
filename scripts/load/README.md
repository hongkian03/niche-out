# Compiled game capacity checks

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
