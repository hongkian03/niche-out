# Public tunnel investigation

This synthetic Epic 1 probe serves a connection/status page and disposable membership state from a loopback listener. It uses the compiled shared contracts. It can investigate public HTTPS browser behavior before the production game server exists.

## Local verification

Run these commands at the project root with the pinned Node runtime.

```sh
npm run build -w @rarity/contracts
node probes/tunnel/run.mjs --self-test
```

The self-test exercises the real loopback HTTP handler with controlled headers. It checks exact Host/Origin rules, forwarded-header non-authority, anonymous upload denial, cookie attributes, same-ID control recovery, 4 KiB command bodies and the 10 MiB upload boundary. It uses no provider.

## Temporary development endpoint

The verified connector installer supplies `tooling/cloudflared`. Set `CLOUDFLARED_PATH` to use another explicit executable. The runner prints its actual version. Integrity verification belongs to the installer and recorded manifest.

```sh
node probes/tunnel/run.mjs
```

The runner binds 127.0.0.1 on an available port and starts one owned Cloudflare Quick Tunnel using HTTP/2. It supplies an empty temporary configuration file, excludes inherited connector configuration environment variables and binds metrics to loopback. It first prints an allocated endpoint, then waits for a successful public HTTPS health response before printing the ready invitation. It allows up to three minutes for public DNS/endpoint readiness and prints progress every fifteen seconds. It uses the machine’s normal DNS configuration.

Open the ready URL on a phone using cellular, or a different Wi-Fi network. Expect an acknowledgement such as **polling → websocket → ok** and **Control generation 1**. The small upload button should report 1024 bytes. A phone result and its network/OS/browser versions must be recorded by the person actually performing the test. If connection fails, record the displayed code, such as POLLING_ERROR, WEBSOCKET_ERROR, ACK_TIMEOUT or RECONNECT_EXHAUSTED, and any HTTP status. These diagnostics omit raw provider messages and credentials.

Type a temporary draft and reload. The draft should clear and the generation should advance once. Duplicate the tab using the browser's menu and use **Check current control** in both tabs. Only the current tab succeeds. **Take control here** explicitly transfers control. Superseded pages display TAB_SUPERSEDED. A copied stale record requires CONTROL_CONFIRMATION_REQUIRED. Each cookie has an eight-page allocation cap in this experiment; use a fresh private browser session after reaching it.

**Reconnect transport** exercises a new transport connection while keeping the loaded document. For a brief network interruption, disable and restore the phone's connection without refreshing; the page should reconnect within its five-attempt backoff window. The probe has no game timers. Actual game state and outage timing are later integration work.

Ctrl-C terminates the listener and owned connector. The manual probe also expires after ten minutes. Quick Tunnel addresses change on restart, so reload the newly printed address and expect fresh synthetic state.

The page uses synthetic data only. It has no host administration or real game file. Sessions, pages, connections, request rates, observations and upload concurrency are bounded. Request bodies time out after ten seconds. Diagnostics record header categories and counts without cookies, proofs, submitted data or raw provider logs.

## Automated public browser run

```sh
node probes/tunnel/run.mjs --test
```

Requires installed Chrome, or a Chromium executable selected with `PROBE_BROWSER_PATH`. A fresh browser profile runs through the actual public endpoint. It checks Secure/HttpOnly/SameSite cookies, polling/upgrade acknowledgements, reload and draft clearing, opener-copied proof races, explicit takeover, same-ID lost-response recovery, exact/oversized upload, transport reconnect, foreign Origin and anonymous upload. It also simulates an HTML gateway response to test client uncertainty handling.

A desktop-browser public run does not establish native Duplicate Tab behavior on every browser, cellular reachability, venue permission, stable-origin connector restart or 100-player capacity. Keep those results separately identified. The original tab model is an isolated experiment; E3 owns production identity ledgers and expiry.

## Named endpoint investigation

Run a connector configured externally to preserve the configured public Host and forward to 127.0.0.1:3210. Then run:

```sh
node probes/tunnel/run.mjs --origin=https://your-hostname.example --port=3210
```

This mode owns only the synthetic listener. The externally started connector remains the operator's responsibility. It supports interruption/restart of the connector at the same public origin without restarting the probe. Production packaged supervision is assigned to E5. A changed public origin requires restarting the experiment and creating fresh browser state.

This remains a development probe. The approved E1-S15–S20 expansion will add managed temporary hosting sessions; no named account or permanent domain is required for that default flow. Actual provider suitability, capacity and venue qualification remain separate evidence gates. If readiness fails, the runner prints a sanitized diagnostic with HTTP/error category, connector connection categories and origin-policy observations. No game-readiness claim is made merely because a URL was allocated.
