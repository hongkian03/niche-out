# Epic 6 provider and transport alternatives

Investigated November 16, 2026 after the owner requested alternatives to the measured polling/reconnect constraint. **This document proposes follow-up work. It does not change the approved provider, client negotiation policy, player limit or game rules.** No account, domain, subscription or deployment was created.

## Recommendation

Keep the current Quick Tunnel implementation available for convenient private games. Improve the client and broadcast behavior in small measured steps: randomized retry timing, WebSocket-first with a deliberately tested polling fallback, then smaller/coalesced complete views. These changes can reduce pressure; they cannot remove a provider's hard request ceiling or repair DNS failures.

For a firm 100-player polling requirement, the best next provider to qualify is an **optional host-owned named Cloudflare Tunnel**. It reuses the existing connector and keeps gameplay on the laptop. It requires a host account/domain and must pass the same workload before it receives a capacity claim. No reviewed provider is a verified drop-in match for all three of: account/domain-free hosting, no project-operated control service, and reliable 100-player all-polling qualification.

The distinction is between persistent registration and an active connection. A named tunnel/domain can remain registered while the laptop runs its connector **only during a hosting session**. It does not require an always-on laptop or a centrally hosted game server. A reused hostname might reduce repeated new-hostname DNS exposure, but that is an inference to test, not a proven fix for the observed `ENOTFOUND`.

## What the tests actually establish

The [load report](EPIC-6-LOAD.md) has a passing 100-player mixed run, a passing locked-answer interruption case and a passing 100-user cold-asset burst. All-polling reconnects encountered edge 429s, which bounded recovery handled. A later DNS interruption and fenced unaccepted answer prevented the complete all-polling run from passing. That is an incomplete qualification, not proof of corrupted scores or insufficient CPU.

The load generator forces transports; it does not execute the browser client's negotiation code. A new transport policy therefore needs browser and client tests as well as another protocol load run.

## Provider comparison

| Provider | Host setup | Relevant verified limits or behavior | Fit |
| --- | --- | --- | --- |
| Cloudflare Quick Tunnel | No account/domain; random temporary URL | 200 in-flight requests; excess 429; development/testing positioning and no uptime guarantee | Easiest existing setup. Keep measured limitations visible. |
| Host-owned named Cloudflare Tunnel | Cloudflare account and domain; locally held scoped credentials | Published account allowance includes 1,000 tunnels and 25 replicas per tunnel. These are not player quotas. No equivalent published 200-request cap or guaranteed 100-player entitlement was found in the reviewed material. | Best next qualification candidate; no new gameplay backend. |
| ngrok Free | Account/authtoken; assigned static development domain | 20,000 HTTP requests/month, 1 GB outbound/month, 4,000 HTTP requests/minute, three online endpoints; initial browser interstitial | Monthly budget and entry friction are poor defaults for frequent polling-heavy events. |
| ngrok paid | Account/token and paid plan | Larger included usage and request rates; additional usage/endpoint charges depend on plan | Optional paid comparison when a host accepts the cost; capacity still needs measurement. |
| Microsoft Dev Tunnels | Host Microsoft/Entra/GitHub login; anonymous players can be enabled | 1,000 active connections/port, 1,500 HTTP requests/minute/port, 5 GB/user/month, 16 MB request body; preview and explicitly not for production workloads | Development comparison, not the recommended event default. |

Sources: [Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/#limitations), [Cloudflare setup](https://developers.cloudflare.com/tunnel/get-started/), [Cloudflare account limits](https://developers.cloudflare.com/cloudflare-one/account-limits/#cloudflare-tunnel), [included tunnel capacity](https://developers.cloudflare.com/tunnel/features/tunnels-for-platforms/), [ngrok free-plan limits](https://ngrok.com/docs/pricing-limits/free-plan-limits), [ngrok current pricing](https://ngrok.com/pricing), [Dev Tunnels limits](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits#dev-tunnels-limits), [Dev Tunnels production warning](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/overview).

Do not equate a raw TCP endpoint quota with a WebSocket-over-HTTPS quota. ngrok lists TCP/TLS connection limits separately; the reviewed HTTP endpoint documentation supports WebSockets but does not establish a precise simultaneous-browser guarantee. [ngrok HTTP endpoints](https://ngrok.com/docs/gateway/endpoints/http)

Microsoft's temporary `devtunnel host` lifecycle resembles the desired session model, but account, preview, quota and distribution constraints remain. A connection-count headline alone obscures polling's request rate. An illustrative 100 clients receiving one GET every four seconds already produce 1,500 GETs/minute before submissions; that arithmetic is not a measurement of this game's exact behavior. [Dev Tunnels FAQ](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/faq)

## Why the transport matters

Polling can hold one receiving GET and issue one sending POST per client. A synchronized 100-player send/reconnect can therefore consume approximately 200 requests before host requests, assets or old polls draining are considered. WebSocket avoids the repeated polling GET/POST pattern. This is a planning model, not a reconstruction of Cloudflare's internal edge accounting. Our observed 429s are stronger evidence than an origin counter, because rejected edge requests never reach that counter. [Engine.IO polling protocol](https://socket.io/docs/v4/engine-io-protocol/#http-long-polling), [Cloudflare WebSocket accounting](https://developers.cloudflare.com/network/websockets/#requests-and-bandwidth-measurement)

| Change | Benefit | Limit / implementation caution |
| --- | --- | --- |
| Randomized bounded reconnect waits | Disperses synchronized retry waves | Does not increase steady-state capacity; preserve current attempt limit and identity rules. |
| WebSocket-first with polling fallback | Avoids initial polling/upgrade traffic on compatible networks | Needs explicit handling of opening timeouts; does not solve a polling-only network or DNS. |
| WebSocket-only | Eliminates polling traffic | Excludes otherwise usable HTTPS networks that block WebSocket. This is a product compatibility decision, not a silent optimization. |
| Smaller/coalesced complete views | Reduces bytes, serialization and response churn | Preserve complete authorized state, immediate phase/ACK delivery and at most 50 ms readiness batching. |
| Delta protocol or compression | Potential later bandwidth savings | More protocol/testing complexity; compression does not remove request-count limits. Defer initially. |

### Concrete client findings

`apps/web/src/client.ts` explicitly sets `transports: ['polling', 'websocket']`, a 10-second connection timeout and `reconnection: false`. Its own scheduler uses fixed 1/2/4/8/15-second waits. Adding Socket.IO's `randomizationFactor` alone would have no effect on this custom scheduler.

Installed Socket.IO 4.8.4 / Engine.IO client 6.6.8 support WebSocket-first and `tryAllTransports`. However, inspection of the installed sources found that Engine.IO switches transports on an opening transport error, while the Socket.IO Manager's timeout closes the engine. A silently blocked WebSocket therefore needs an explicit bounded switch to polling on the next attempt; merely changing the array and trusting automatic fallback is insufficient. Preserve terminal authentication/removal failures. [Socket.IO client options](https://socket.io/docs/v4/client-options/#tryalltransports), [transport upgrade rationale](https://socket.io/docs/v4/how-it-works/#upgrade-mechanism)

### Concrete snapshot findings

- `publishedStandings` appears in every live Reading/Answering player view, but the current web source does not consume it. The player uses their own published total during answering and shows standings at results/final. Removing this unused live field requires a coordinated contract/projection/fixture update, not a delta protocol. An illustrative 100-row object was about 9.7 KB before compression, nearly 1 MB across one broadcast to 100 players; actual savings must be measured.
- Each successful resume can cause a global publication, a targeted snapshot and a separate client state read. A 100-player reconnect can produce on the order of 10,000 full-view emissions. Coalescing non-phase presence updates and avoiding unchanged global views could address the observed tail and traffic, while keeping the reconnecting client's authoritative view immediate.
- Clock samples start together after connection and repeat every 30 seconds. Keep an immediate initial sample, then stagger remaining/periodic sampling and verify timer accuracy. Emitted views/Socket.IO packets are not necessarily one HTTP request each.

The `STALE_REQUEST` finding needs its own actual-`GameClient` reproduction. Preserve the ledger fence, read authoritative answer state and require explicit resubmission if no answer was accepted. A fresh mutation ID must not be silently invented to make a benchmark's score assertion pass.

## Small follow-up chunks and dependencies

| Order | Deliverable | Verification |
| --- | --- | --- |
| T1 | Injected randomness and bounded jitter in the existing scheduler | Delay bounds, five-attempt exhaustion/reset, cancellation and no automatic superseded-tab takeover |
| T2, after T1 | WebSocket-first plus explicit timeout-to-polling fallback | Immediate rejection, silent opening timeout, successful fallback, both unavailable, auth/cookie/origin/removal paths, real Chrome negotiation |
| T3, after T2 | Remove unused live standings; coalesce presence publications without changing full-view semantics | Contract/privacy parity, immediate phase/ACK behavior, 50 ms bound, reconnect/uncertain-answer regressions |
| T4, after T3 | Repeat identical declared workloads | Mixed, polling-only, 100 reconnect, cold resources, locked/pending outage; compare bytes, latency tails and preserved scores |
| P1, independent investigation | Owner decides whether an account/domain is acceptable for event hosting | Record operator-owned versus project-owned credential/control-plane choice |
| P2, after P1 | Named-tunnel provider adapter chosen before session start | Exact-origin checks, scoped credentials, startup/health, shutdown/cleanup and redacted diagnostics |
| P3, after P2 | Same 100-player qualification and real browser/network check | No capacity claim from provider branding or absence of a published quota; retain failures |

These are proposed follow-ups, not completed Epic 6 implementation. The existing target remains 100 players; no silent reduction or live-session provider switch is proposed.

## Accounts, bundling and operational ownership

An operator-owned Cloudflare account/domain is closest to the goal of avoiding project hosting costs. A project-owned automatic tunnel provisioning service would add a central control plane, authentication, abuse controls, shared quotas and cleanup responsibilities, even though gameplay stayed on laptops. Never ship a project master API token inside the application. [Cloudflare token boundary](https://developers.cloudflare.com/tunnel/reference/tunnel-tokens/)

Named mode can reuse the existing Apache-2.0 `cloudflared` binary, subject to completing the notice review already recorded. The official ngrok Node SDK has an Apache-2.0/MIT license, but Agent redistribution under customer-owned accounts has separate consent language in the service terms; the chosen integration needs review before bundling. Microsoft's MIT SDK license likewise does not establish permission to redistribute its separate preview CLI or use the preview service in production. [cloudflared license](https://github.com/cloudflare/cloudflared/blob/master/LICENSE), [ngrok SDK](https://github.com/ngrok/ngrok-javascript), [ngrok terms](https://ngrok.com/tos), [Microsoft SDK license](https://github.com/microsoft/dev-tunnels/blob/main/LICENSE), [Dev Tunnels preview EULA](https://download.microsoft.com/download/e/3/f/e3f44a20-7c3f-45fa-b3d0-dc2547545c0a/Dev%20Tunnels%20EULA.pdf)

Paid service or domain prices can change. No purchase is recommended as a substitute for a bounded qualification test, and no new hosting guarantee follows from this investigation.
