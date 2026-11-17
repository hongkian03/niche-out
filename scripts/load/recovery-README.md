# Scoped recovery fault workload

Build the production app using the pinned Node runtime first. Run capacity campaigns serially; do not overlap with another load test, build, browser audit or package assembly.

```sh
node --test scripts/load/recovery-relay.check.mjs
node scripts/load/recovery.mjs --players=4 --out-dir=work/recovery/calibration
node scripts/load/recovery.mjs --players=100 --out-dir=work/recovery/local-100
node scripts/load/recovery.mjs --tunnel --players=100 --uplink=eduroam --out-dir=work/recovery/public-100
```

Each invocation creates its own production application, a loopback TCP relay, and optionally its own managed Cloudflare Quick Tunnel. No traffic targets a third-party game and the Mac's network configuration is never changed. Run-time reports include compiled build identity, pass/fail checks, elapsed time, the declared network and final server diagnostics. Reports omit invitation URLs, credentials, request IDs, player identities and answer banks.

The two-round workload admits the requested number of players (4–100) and then:

1. Drops a successful create/replace HTTP response after headers and before reading its body; resolves the original operation and replays it safely.
2. Discards the Start acknowledgement and resolves it exactly once while every player remains admitted.
3. Locks half the round's answers, cuts all app transports in both directions, observes actual socket disconnections, waits three seconds, restores the same relay listener, and reconnects the original pages. It verifies the same controls, locked answers, running monotonic deadline and no lost identities.
4. During round 2, gives a new tab control, rejects the old control generation, and explicitly transfers control back.
5. Discards a removal acknowledgement, resolves its outcome and verifies other identities remain.
6. Checks exact 200-point totals for all remaining players, replaces the finished game, and rejects delayed old-game mutation.
7. With `--tunnel`, sends **SIGKILL to the actual owned cloudflared PID**, verifies terminal `connector-exited` hosting state with its public URL hidden, and stops/disposes the failed application. The old Quick Tunnel URL is not expected to recover after connector death.

The relay cut exercises full loss of transport reachability for the owned application, including outstanding HTTP/WebSocket links. It is a controlled analogue, **not an actual whole-OS internet outage** or an unsolicited change to eduroam. Local mode uses forced WebSocket Node clients; public mode traverses the real provider but also uses forced WebSocket. Neither certifies polling-only capacity, browser-managed retry behavior, physical phones or venue connectivity.

The discarded socket ACKs are observation-loss faults: the server and Socket.IO still send them, while the coordinator deliberately declines to use their values and checks `/api/host/operations/resolve`. The create/replace HTTP body is actually closed before consumption. This tests authoritative mutation resolution without falsely attributing the fault to a provider.

All owned sockets, relay listeners, applications and optional connectors are closed in `finally`. A failed result is retained in its own output directory; use a fresh directory for another run. No timeout or game scoring limit is changed for a pass. The small relay check establishes forwarding, two-sided cut, offline rejection, same-listener restoration and cleanup independently from the full game.
