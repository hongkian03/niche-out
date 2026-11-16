# Production protocol probe

This is a test-only browser client for Epic 3's actual game server. The normal launcher never mounts these assets. It exercises protocol behavior before the full Epic 4 screens exist.

With the pinned Node runtime selected:

```sh
npm run test:game:tunnel
```

The script starts and cleans up its own production server and temporary Cloudflare tunnel. It uses separate Chrome browser contexts for the host and players; uploads through a real worker; drops a committed response before the browser receives it; retries it after admission; rotates owner authority; runs two rounds; removes a player; transfers tab control; interrupts/resumes the owned connector; checks public authority and static-asset isolation; and validates wire responses. Built-in checks use no permanent account or domain. A failed assertion exits without claiming a passing transport gate.

For the required off-network check:

```sh
npm run probe:game
```

This opens visible Chrome and prints `MANUAL_JOIN_URL` after the production lobby is ready. On a phone with Wi-Fi disabled, open that URL, keep the supplied game code, and join as **Phone**. The game starts once the phone joins. Submit **Fall** in the season round and **Amber** in the colour round. Expect acceptance followed by Results and then Finished, with Phone and Auto both on 200 points. The timer advances automatically; the zero-latency simulated clock from Epic 2 is not used here.

After the automated checks finish, the script brings the Auto player tab to the foreground and prints `MANUAL_DUPLICATE_READY`. Use Chrome's actual **Duplicate Tab** menu. The original should show **Tab superseded**. Clicking **Take control here** in the original should reverse control. Reload and transport reconnect should preserve the same admitted player and scores; no answer draft is stored. The script keeps the session available for up to ten minutes at this final inspection stage. Ctrl-C stops the test and closes its browser/server/connector.

Record the actual phone/browser version, phone's cellular access and host uplink type in the evidence. Headless browser contexts share the host's network and do not substitute for that off-network evidence.

The client stores only continuation metadata in sessionStorage. It renders imported strings as text and displays only permitted snapshots. Its controls and raw-view panel are diagnostic fixtures, not the approved game's UI design.
