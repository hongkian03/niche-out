# Epic 1 managed hosting handoff

Recorded November 14, 2026. Work lives in `~/Projects/niche_out`. Three parallel implementation agents owned manager/contracts, public application/owner access, and launcher/dashboard; the coordinator integrated dependencies, reviewed boundaries and ran the combined real-provider tests. All **20 Epic 1 stories and G1 are complete**. The [master tracker](../../IMPLEMENTATION-PLAN.md) is the story-status source. At this handoff Epic 2 had not started; subsequent work is recorded in the [Epic 2 handoff](EPIC-2.md).

## Delivered application foundation

| Story | Implementation |
| --- | --- |
| [S15](E1-S15.md) | Event-purpose Quick Tunnels are accepted; strict session lifecycle and sanitized failure contracts are executable. |
| [S16](E1-S16.md) | Reusable manager verifies and owns the connector, discovers its URL, validates instance-specific public health and monitors continuity. |
| [S17](E1-S17.md) | Foreground developer launcher and separately authenticated local setup. Start, cancel, finish, quit and private reopening work without manual connector configuration. |
| [S18](E1-S18.md) | Dashboard with local QR/copy/enlargement, private owner bootstrap and synthetic public connection/upload/tab page. |
| [S19](E1-S19.md) | Actual connector interruption/recovery, endpoint-loss classification, explicit fresh-session recovery, cancellation and cleanup. |
| [S20](E1-S20.md) | Reproducible integrated browser harness and current manual evidence below. |

The public connection page is clearly labelled synthetic. Game engine, JSON import/admission, scoring and full game UI remain E2–E4. Runtime-inclusive cross-platform packages and OS process/power hardening remain E5; capacity/provider/event qualification and signed release remain E6.

## Architecture and authority

The visible local launcher owns a separate loopback controller and one managed application session. The controller uses a private one-use per-launch bootstrap and HttpOnly/SameSite cookie; exact Host/Origin checks and authenticated routes protect local state. The connector forwards only to the application listener, never the local controller.

The application listener serves both public player and private host pages at the same temporary HTTPS origin. Private host links are minted locally and exchanged for a Secure/HttpOnly/SameSite host cookie. Tokens expire after 60 monotonic seconds; replay fails, unused-link creation does not revoke the current host, successful recovery rotates authority, and an admitted synthetic player cannot become host through exchange. These narrow foundations are reused/extended by E3.

The manager checks a random session-specific health nonce, not merely a child PID or allocated URL, before enabling sharing. A temporary outage preserves the current application/session and enters Reconnecting. Connector death or prolonged endpoint loss enters Failed, hides sharing and requires explicit Finish/new session. No background replacement URL is silently adopted. A hosting session has no ten-minute probe expiry and remains available through future game results until explicitly finished. Game lifecycle/disposal is currently represented by an application adapter and synthetic membership state.

## Verification recorded

Environment: Apple M3 Pro, 18 GiB, macOS 26.5.2 arm64; Node 24.22.3/npm 11.19.1; cloudflared 2026.11.0; installed Chrome 157.0.8103.51. Tests use synthetic data only. No permanent domain, named account or provider credential was required.

- Type checking and all four workspace builds pass.
- `npm test` passes **147 tests across 11 files**. Added coverage includes lifecycle cancellation/reentrancy, wrong-instance health responses, connector integrity failures, local control security, Quit/Start races, token replay/rotation/conflicts, malformed public targets and transport/session binding.
- The browser fixture scan covers **nine built/served browser files**, including the actual managed assets.
- The initial managed real-provider Chrome run passed local authorization, verified startup, exact generated QR payload, owner exchange/reload, public/local control isolation, polling/WebSocket acknowledgements, reload/draft clearing, popup-copied tab proof races, same-ID reply recovery, 10 MiB/+1 bounds and negative requests.
- The real owned connector was suspended and resumed on this Mac: state became Reconnecting then Ready at the same origin/session, with host access preserved. Termination produced Failed and removed sharing; Start was rejected until explicit Finish. This is a real connector interruption, distinct from the client Reconnect button. Forced parent-death handling on every OS remains E5.
- The user confirmed the new dashboard reached Ready, then scanned its QR on an iPhone using cellular and reported successful connection, small upload, refresh/draft clearing and reconnect. The earlier recorded phone version is iOS 27.0.1. This was the actual managed launcher flow, not the old timed probe.
- The user reported one controlling tab, TAB_SUPERSEDED in the other, and correct reversal after Take control here. The user explicitly confirmed using the actual Duplicate Tab menu. This closes the native duplication check for the available Mac browser; its exact version was not supplied, so no additional browser-matrix claim is made.
- The final expanded browser run **passed**: actual dashboard Start, QR enlargement, private host opening, second fresh origin/session and control generation 1, Finish confirmation, return to idle and cleanup. A separate local browser regression passed the stale-dashboard state-loss case: the server requires confirmation and the page refreshes state and opens the dialog without automatically confirming.

The first managed automation attempt used the old probe's cookie name and failed its test assertion after startup/owner/QR checks. The harness was corrected to accept the application's cookie name; the subsequent real-provider run passed. Final review fixed observer reentrancy, the local Quit/Start window, asynchronous QR fencing, stale-dashboard confirmation and malformed request-target handling, with regression coverage. Both automated sessions and the manual launcher exited cleanly. A targeted process check found no remaining test runner, launcher or project connector. No raw provider output or private bootstrap links are stored in this evidence.

## Run and test on this Mac

```sh
cd ~/Projects/niche_out
export PATH="/Users/kianhong/Documents/Codex/2026-11-12/in-this-project-directory-i-want/work/node-v24.22.3-darwin-arm64/bin:$PATH"
npm run host
```

The browser opens authenticated local setup. Select **Start hosting**. The temporary DNS name can take a few minutes to propagate; sharing becomes available only after the public health check passes. Share the public link/QR. **Open host page** is private and must not be shared. The current public page demonstrates connectivity, not gameplay.

Phone checks: use cellular, scan the QR, expect WebSocket `ok` and control generation 1, upload 1,024 bytes, type a draft and refresh (draft clears and generation advances), then reconnect/check control without another generation change. For native tab testing, use the browser's Duplicate Tab menu and verify only one controller, plus explicit transfer.

**Finish hosting** confirms loss when synthetic/game state exists, stops the public session and returns setup to idle. Starting again creates a fresh URL and identity. **Quit launcher** or Ctrl-C also closes setup. Closing the browser leaves the process alive; press Enter in the interactive terminal to reopen setup. On a fresh checkout install dependencies and run `npm run setup:tunnel` first; startup itself downloads nothing.

```sh
npm run typecheck
npm run build
npm test
node tests/fixtures/check-browser-assets.mjs
npm run verify:tunnel
npm run test:hosting
```

`test:hosting` owns separate temporary sessions and closes them. Its POSIX connector suspension test runs only when the connector exposes a local PID; other platforms need their own lifecycle evidence. The old `probe:tunnel` command remains an isolated ten-minute diagnostic, not the application launcher.

## Remaining qualification

Actual Windows/Intel Mac/Linux package startup and descendant cleanup, suspend/power behavior, full gameplay, 100-player capacity, actual event venue/provider suitability and signing remain their assigned later stories. The user-performed native-menu and cellular-device evidence is recorded above. A passing synthetic session does not establish those later gates.
