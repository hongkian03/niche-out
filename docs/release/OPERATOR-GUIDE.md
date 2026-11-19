# Running a Niche Out session

Niche Out runs the game on the host's laptop. A managed Cloudflare Quick Tunnel forwards a temporary public HTTPS address to that local server. Players can join from different internet connections; they do not need the host's Wi-Fi. The host computer and every player require working internet access for this public mode. No Cloudflare account, domain or port forwarding is required. The planned npm host distribution requires supported user-installed Node; players need only a browser.

## Planned npm installation and startup

The [npm migration](../implementation/epic-05-npm-distribution.md) is **planning only**. No published package/command is available from this change. The planned executable is `niche-out`; its exact npm package name/version must be confirmed before these become release instructions.

1. Install supported Node (`>=24.22.3 <25`) on macOS 15+ arm64/x64, Windows 11 x64 or Ubuntu 24.04+ glibc x64. Prebuilt helpers avoid host compiler requirements; other architectures/distributions are not automatically certified.
2. Install/run the reviewed exact npm version through documented global/local/npx entry points as an ordinary user. No install hook builds code or downloads components. Package files may remain read-only.
3. Use explicit prepare, or Start hosting's visible preparation, to acquire the pinned connector into a user-writable verified cache. Cold preparation needs internet; warm cache avoids another dependency download. Tunneled play still needs internet. Failed/offline acquisition must not run unverified bytes.
4. Keep the CLI terminal open and use the existing local dashboard. Automatic browser opening and private reopen/recovery actions remain. Windows instructions will cover Command Prompt/PowerShell and a `.cmd` alternative if shell policy blocks a PowerShell shim; do not weaken machine-wide policy.
5. Follow gameplay steps 4–8 below. Keep editable game JSON outside package/cache. Asset paths are package-relative, independent of the current working directory.

These steps do not claim an npm command currently exists. Source-checkout instructions remain usable until implementation and clean-package tests pass.

## Historical private archive startup

These steps describe existing private Epic 5 archives, retained for old-build tests rather than the future public distribution flow.



1. Obtain the artifact for the machine: macOS Apple Silicon (`darwin-arm64`), macOS Intel (`darwin-x64`), Windows 11 x64, or Ubuntu 24.04+ x64. Current files are private test artifacts; public signature verification is not yet available. Linux needs systemd/logind, `systemd-inhibit` for idle-sleep prevention and `xdg-open` for opening the browser.
2. Extract the entire folder. Keep the bundled runtime, connector, helpers, manifests, assets and notices together. Do not edit verified bundled files. Copy an example JSON outside the folder before editing it.
3. Run `Start Niche Out.command` on Mac, `Start Niche Out.cmd` on Windows, or `start-niche-out.sh` on Linux. Keep the visible launcher/console running. Open the displayed local hosting dashboard if the browser does not open automatically.
4. Click **Start hosting**. Wait for **Ready**; connecting can take time. The application checks public HTTP and real-time connectivity before offering a usable invitation.
5. Open the host page using the launcher's host action. Upload the JSON, inspect its title, tiers, prompt count and durations, then **Create lobby**. Share only the player join URL/QR and game code. The host-access link is private and must not be shared.
6. Players scan the QR or open the public URL, enter a nickname and join. A code works only at this particular host's temporary site; there is no global code lookup service.
7. Check the roster and press **Start** when ready. Entry closes immediately. Reading, answering and results advance automatically. Remove Player requires confirmation. There are no pause, skip or score-edit controls.
8. Results remain while hosting stays alive. Creating a fresh lobby clears the previous game's results and uses a new code. Finish hosting or quit the launcher when done.

For a development checkout, install the pinned Node/npm versions, run `npm ci` once, then use `npm run host` from `~/Projects/niche_out`. The development command builds the browser/server and native adapter; it is contributor setup, separate from both historical archive startup and the planned compiled npm CLI.

## During play and recovery

Closing the browser does not stop the server. Use the local launcher's **Open host page** action to regain host access after losing browser cookies. If that browser is an admitted player, open the private link in another browser profile/private window; a player is never silently converted into host.

An admitted player can reconnect in the same browser with score and accepted answers preserved. A newer tab controls the identity; **Take control here** explicitly transfers it back. Unsubmitted text clears on refresh. During a temporary disconnection the current draft is frozen, and it is never automatically submitted.

The host requests idle-sleep prevention while a game is active. Keep the laptop plugged in and its lid open; intentional sleep can still interrupt service. An expired phase closes once on wake and the next phase receives its full duration when the same public origin survives. A change to the laptop's underlying IP is not itself a new game; loss/change of the public tunnel origin requires an explicit fresh hosting session and new player URL/game. A stopped process loses all in-memory games and results.

## Troubleshooting

| Symptom | Action and meaning |
| --- | --- |
| Connecting tunnel takes a long time | Keep the launcher open and inspect its status. Check internet access, captive portal login and whether the network permits the connector's outbound traffic. A temporary hostname can need time to become reachable. Do not share an invitation before Ready. |
| The page loads but real-time connection fails | Verify the current public URL and inspect polling/WebSocket status. A gateway can allow HTTPS pages but interrupt long-lived connections. Retry the same session if its origin still exists; use another permitted uplink if needed. |
| Import capacity error | Inspect the local diagnostic reason. Capacity is more than the 10 MiB byte limit: worker timeout, memory headroom and concurrent import state are distinct. Preserve the old game; do not repeatedly overwrite it. Provide the nonsecret diagnostic code, file size and runtime version when reporting. |
| JSON validation error | Follow the field path. Prompts require accepted answers/aliases/assigned tiers. Unknown keys, duplicate normalized spellings, invalid tier references and out-of-range values reject the whole candidate. Existing game/results remain until successful replacement confirmation. |
| Full or game already started | New admission is closed at 100 active players or after Start. Existing admitted browsers can reconnect while full. A fresh nickname is not identity recovery. |
| Public link expired | The connector/session ended or got a new hostname. Restart through the local dashboard, create a fresh game and share the new QR. The old code cannot restore the old server's memory. |
| Corrupt/missing resource | Old archive: extract a fresh complete copy. Planned npm: reinstall the reviewed exact package version or explicitly re-prepare damaged cache. Do not edit manifests, run unchecked binaries or require host compilation. Keep editable JSON outside package/cache. |
| No automatic browser open / sleep prevention unavailable | Open the displayed local URL manually; keep the machine awake. Check the platform dependencies. These are separate from game validation. |

When reporting a fault include build/source digest, OS/CPU, app/Node/connector versions, phase, approximate player count, network type, operation and sanitized error code. Do not post cookies, owner recovery links, one-use secrets, private JSON contents, provider tokens, full environment dumps or signing credentials. HTTP/provider failures and answer rejection are separate diagnoses.

## Provider and updates

Quick Tunnels have no uptime guarantee, a documented 200 in-flight request limit and no Server-Sent Events support. Niche Out uses Socket.IO polling/WebSocket; 100 players are not automatically equivalent to 100 in-flight requests. Asset bursts and fallback polling need measured headroom. Cloudflare describes Quick Tunnels as a testing/development service; a successful test does not guarantee event availability. See [Cloudflare's limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/#limitations).

Public TLS terminates at the provider before forwarding through the connector to the local loopback listener. This is a provider-mediated internet service, not a private offline LAN. A named provider endpoint is a future option and is not required for the current managed temporary-session workflow.

Planned npm updates are explicit and between sessions: finish hosting, quit the CLI, install/run the reviewed exact new version, then start fresh hosting. Follow published package/native verification instructions. Never change package files or in-use cache entries during a game; versioned content-addressed cache entries remain immutable while active. There is no background updater, saved-game/history migration or automatic URL/state resurrection. Keep game JSON outside package/cache. Historical archives update by obtaining/verifying a new complete archive and extracting it separately.
