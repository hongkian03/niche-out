# Production game server

Epic 3 connects the deterministic core to real HTTP/Socket.IO clients. `npm run host` uses this application through the existing managed tunnel launcher. Full gameplay screens arrive in Epic 4; the built shell already completes private owner exchange and clears its bootstrap fragment.

## Module map

| Module | Responsibility |
| --- | --- |
| `src/game/application.ts` | Restricted Fastify listener, assets, origin checks, authenticated routes/socket dispatch, core scheduling, publication and lifecycle |
| `src/game/sessions.ts` | Browser-cookie identities, bounded guest/page registries, membership discovery, continuation proof and controller generations |
| `src/game/ledger.ts` | Semantic request identity, pinned outcomes, bounded rejected cache, sequence high-water marks and cancellation fences |
| `src/game/imports.ts` / `import-worker.ts` | Raw upload reservation, worker parse/compile, memory preflight, timeout, candidate staging and consumption |
| `src/game/hosting-status.ts` | Sanitized mapping from managed session lifecycle to game reachability |
| `src/hosting/owner.ts` | One-use local owner bootstrap and rolling owner credential authorization |
| `src/hosting/launch.ts` / `manager.ts` / `controller.ts` | Foreground launcher, owned temporary connector and separate private local control listener |

The historical `src/hosting/application.ts` and `membership.ts` remain synthetic Epic 1 fixtures for regression tests. The normal launcher imports `createGameApplication` from `src/game/application.ts`.

## Lifecycle and trusted inputs

`createGameApplication(sessionId, healthToken, options)` binds only `127.0.0.1`. Default ports are 3210–3220; occupied ports are skipped without touching their processes. Tests can request port 0. The manager calls `configureOrigin` once the connector allocates its public origin; a changed origin requires a new application. It forwards sanitized status through `setHostingStatus`, enabling Start only after verified reachability.

The handle exposes `healthPath: '/hosting-health'` for the manager's instance/nonce check, while `/health` retains the protocol-v1 health response. The public health nonce is an instance check, not an owner credential. The manager never forwards its separately authenticated local controller.

`mintOwnerLink` is invoked only from local control. The public `/api/owner/exchange` checks the one-use 60-second token and refuses an admitted-player browser without consuming it. Successful exchange rotates authority. Cookies are Secure, HttpOnly and SameSite=Strict. Admitted-player and host credentials follow the architecture's 24-hour rolling valid-use expiry; waiting guests use ten minutes. All state is process-local and disappears on restart.

The `diagnosticAssets` option is trusted constructor-only test configuration. It is absent from normal launcher startup and cannot be set by a browser. Only the exact built shell/hashed JS/CSS paths are served normally; no arbitrary filesystem static root exists.

## Command and recovery sequence

1. POST `/api/session` before admission/resume. Retain the server-issued page ID/request prefix and only continuation metadata across a reload. Socket handshake auth contains `protocolVersion`, `serverInstanceId`, and `tabId`; the cookie establishes identity.
2. Send contract-v1 envelopes and strictly increasing mutation request sequences. The server resolves membership/role from its cookie registry. Client-supplied scores, timestamps, player identity or unknown fields are rejected.
3. Authenticate current role/page/removal/controller state before any cached result. Match the semantic fingerprint, recover an authorized identical outcome, then apply new-operation game/phase/deadline/rate checks. Accepted answer, join, Start, removal and commit outcomes are pinned within game/admission bounds.
4. Reuse the same request ID and payload after a lost acknowledgement. Do not construct a new commit or answer to retry an uncertain one. Host operations can use `/api/host/operations/resolve` to recover APPLIED, report SUPERSEDED, or atomically fence execution with NOT_APPLIED. A fenced commit invalidates its candidate and requires revalidation.
5. For control transfer, a valid current proof is consumed once and rotated. Supersession emits `player.superseded` and disconnects the old socket. The old page must not automatically reconnect in a command loop; an explicit Take control here action reconnects the registered page and claims control. Cached grants cannot restore an older generation after a takeover.
6. Render only complete permitted views. Lower revisions are obsolete; equal-revision snapshots can refresh clock sampling. The core's `touchRevision()` lets server-owned hosting/control/import metadata produce a new revision without changing gameplay. Read-only state/clock requests do not advance mutation sequence high-water marks or state revisions.

Actual timer callbacks are wake-up hints. An early callback always rearms rather than leaving a phase stuck. Timed transitions, finalization, acknowledgement and revocation are immediate; only readiness-only state publication may be batched for at most 50 ms. A tunnel outage does not pause gameplay or extend deadlines. OS-specific suspension detection remains Epic 5.

## Imports and resource limits

Only a current owner may reserve an upload before body consumption; authority is checked again afterward. One upload/worker or one staged candidate exists at a time. Raw bytes are capped at 10 MiB, then JSON parsing and compilation run in a temporary worker with a ten-second timeout and 256 MiB old-generation heap ceiling. The existing memory headroom checks run before worker creation; transfer/rehydration costs are measured, not assumed away. A summary never contains prompt or answer banks. Candidates expire after five minutes and are generation-bound one-use commit tickets.

Existing limits are enforced: 100 concurrent players, 1,000 admissions per game, 256 waiting guests, eight pages per browser, 128 pending namespace handshakes with ten-second expiry, 4 KiB transport frames/envelopes, and bounded two-minute rejected-operation caches. Replacement bounds former memberships entering the waiting pool, and retired ledger scopes do not accumulate across games.

Starting per-session token buckets are answer/join/control **4 per second, burst 8**, and state/clock reads **20 per second, burst 40**. They apply to new work after cached mutation recovery. Shared-NAT clients have independent identities; a claimed forwarded IP does not establish authority or a unique-player assumption. These operational limits require later capacity tuning.

## Verification commands

```sh
npm run test:server
npm run test:game:tunnel
npm run probe:game
npm run measure:import
```

`test:server` builds first because the real worker executes built JavaScript. `test:game:tunnel` runs an isolated automated Chrome/provider game and cleans it up. `probe:game` adds cellular and native Duplicate Tab steps; see [its guide](../../probes/game/README.md). `measure:import` reports numeric-only timing/memory for actual compiled worker transfers. None of these tests certify the later release/browser/event matrix or 100-device throughput.
