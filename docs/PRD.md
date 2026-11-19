# Custom Rarity Game PRD Version 2

Status: Accepted managed-session tunnel baseline, with npm implementation handoff updated November 18, 2026. Niche Out runs its authoritative server on the host laptop and browsers reach it through one public HTTPS tunnel origin per hosting session. Managed setup and the browser game are implemented. The local npm candidate is delivered; remaining target/lifecycle acceptance and public release qualification are tracked separately. Event validation remains required.

## Product purpose

Create and host custom multiplayer prompt games entirely through a website. Players join from their own devices using a game code and compete to submit valid answers assigned rarer, higher-scoring tiers by the game maker or host.

The project is primarily for the owner's personal use and will be open source so others can run their own instance. The reference game is [Krillion](https://krillion.io/). This product uses custom JSON prompt files, configurable timing, and author-defined tiers and points.

## Audience and scope

The prototype supports one active game per hosting setup, with up to 100 players plus a host admin interface. The host operates the game through a browser. Players use browsers on their own devices without accounts or installed client apps.

Game sessions run on an application server on the host's laptop. An operator-owned tunnel connector forwards the configured public HTTPS endpoint to that server's loopback listener. Host and player browsers use the same public origin. Players can join from separate Wi-Fi networks or cellular service, provided their network permits the endpoint.

The implemented local distribution candidate is one npm CLI package, not yet published to the registry. Hosts install supported Node themselves; players need only a browser. The package contains compiled application/browser assets and small prebuilt native helpers for macOS Apple Silicon and Intel, Windows x64, and Linux x64; hosts do not need a compiler or application build. The pinned tunnel connector is obtained and verified in a per-user cache on explicit preparation or Start hosting, without npm install hooks. Available-Mac installed-package checks are recorded in the [npm handoff](implementation/evidence/EPIC-5-NPM.md); actual Intel/Windows/Linux and remaining physical lifecycle acceptance are still open. Public release requires verified npm integrity/provenance and appropriate native authentication/OS validation; those procedures are defined by the revised release plan. The earlier runtime-inclusive extract-and-launch archives are historical outputs, not the new release target. The application creates a temporary public endpoint automatically when the host starts hosting, then supplies the public link and locally generated QR. The default flow requires no host Cloudflare account, domain, credentials or manually configured tunnel. Game invitations add the game code after a lobby exists.

A visible local launcher owns the server and connector and opens a local setup interface with Start hosting. This control interface remains on a separate loopback boundary and is never published through the tunnel. Starting hosting prepares a missing connector through a visible cancellable download/verification step, then verifies the cached connector, starts the listener and connector, discovers the temporary HTTPS endpoint, and verifies public readiness before showing an active link or QR. Repeated startup actions cannot create parallel connectors or sessions. Start game remains unavailable until hosting is ready.

A hosting session spans setup, lobby, play and final results. Its tunnel remains running until the host selects Finish hosting or quits/closes the launcher; there is no application-imposed ten-minute expiry. Closing a browser leaves hosting running. Finish hosting stops the server and connector, disconnects players, and clears temporary state/results. A deliberate shutdown with an existing game requires a warning and confirmation; it is a hosting-lifecycle action, not an additional in-game End/Pause control. Finishing the last round does not automatically close the tunnel. A fresh hosting session gets a new endpoint and fresh state; a replacement game within a healthy hosting session can reuse its endpoint but always receives a new lobby/code.

During active games, request prevention of automatic idle sleep. If the same server process survives sleep at the same public origin, close any expired current phase once and give the next phase its full configured duration. A change to the laptop's underlying Wi-Fi or IP can preserve the game when the connector restores the same public origin. A change to the public scheme, hostname or port requires explicit host confirmation of a fresh hosting session, game, code and invitation. Loss of the endpoint must never silently start another tunnel or migrate player identities to a new URL. A stopped server process loses the game.

Internet connectivity and the tunnel provider are required during tunneled play. A transient tunnel outage preserves in-memory game state and browser identities at the same public origin. Timers continue while the server is awake, including when the whole room is disconnected. Missed rounds earn 0 and reconnection synchronizes authoritative state. This release uses tunnel hosting; selectable direct-LAN/offline hosting is deferred.

Each host runs their own connector and game computation on their laptop while the provider carries live traffic and may impose quotas or limits. The project maintainer's optional information/download website remains separate from game sessions. There is no shared global room directory. A Cloudflare Quick Tunnel is the default candidate for managed session hosting. Its temporary endpoint is sufficient if it remains usable for that session; a permanent hostname is not a product requirement. Provider suitability, venue connectivity, recovery and 100-player capacity still require evidence before event qualification. A named tunnel is an optional future alternative, not mandatory setup for the default flow.

The target host OS floors are macOS 15+, Windows 11 x64, and Ubuntu 24.04+ x64/glibc as the Linux validation family. The enforced initial host runtime range is Node >=24.22.3 <25, distinct from the exact contributor/build pins. Target support is not a claim that all platforms have been executed; consult the implementation evidence for the current matrix. Other compatible Linux distributions are initially unvalidated. English-language content and English interface labels are sufficient for the prototype; multilingual support and localization are deferred.

## Roles

| Role | Responsibilities |
| --- | --- |
| Game maker | Prepare the JSON file with prompts, accepted answers, aliases, tiers, point values, and timing parameters. |
| Host | Upload the JSON, share the game code or join link, start the game, and remove players. The host interface does not compete. |
| Player | Join with a nickname, submit answers within the deadline, and view results. |

The game maker and host may be the same person.

## Game configuration

The uploaded JSON defines:

- An ordered list of 1–20 prompts. Every prompt is played in file order.
- Each prompt's accepted answers and explicit spelling aliases.
- A manually assigned tier for each accepted answer.
- Tier names and point values. There is no fixed six-tier system or prescribed set of point values.
- Timing parameters, using the defaults below when omitted.

| Timing parameter | Default |
| --- | ---: |
| Reading period | 3 seconds |
| Answer period | 25 seconds |
| Round results period | 10 seconds |

Replacing the JSON after a lobby opens creates a fresh lobby and code, and players must rejoin. A confirmed rejected replacement leaves the old lobby intact. If the response is lost, automatically retry the same commit at most twice and reconcile its outcome; never create another game merely to recover a missing response. Replacement is unavailable during timed play.

Settings are authored in the JSON. One game-wide set of durations applies to every prompt; per-prompt timing overrides are outside the prototype scope. The JSON contract appears below.

## Joining and lobby

Players open the configured public HTTPS join page, enter the game code and a nickname, and wait in the lobby. A direct link or QR code includes that public origin and prefills the code. Player accounts and installed client apps are not required.

Game codes identify games on the reached host instance. Joining requires its public URL as well as the code; there is no global code lookup. A forwarded invitation can allow an outsider to attempt joining while entry is open. The existing identity-based removal and bounded admission rules apply. Stronger invitation approval or player-account features are deferred.

The host presses Start to close new-player entry and begin the automatic game. New players cannot join after this point. Existing players can reconnect from the same browser with their score and locked answers preserved.

Each new game uses a fresh lobby and a new game code. Players join again; retaining a roster for a rematch is outside the prototype scope.

## Host experience

The authenticated local launcher/setup interface alone creates the private recovery link and provides Open host page to restore host access after losing cookies or switching browsers, without restarting the server or interrupting the game. The browser opens the host page on the same public HTTPS origin as players. The recovery secret is excluded from player invitations, logs and QR codes; reaching the public endpoint alone grants no host authority. If the browser already has a nonremoved player membership in the current game, refuse owner recovery there and explain how to use a separate browser profile or private window; preserve that player and the existing host authorization.

The host page doubles as an optional shared screen showing the prompt, timer, round results, and leaderboard, suitable for a projector or larger display. Each player's own device still provides everything needed to play.

The first version's gameplay admin controls are Start and Remove Player. Additional controls are deferred. Uploading a file and setting up another game are setup actions. Start hosting and Finish hosting belong to the local launcher/setup interface, separate from gameplay administration.

Remove Player takes the participant out of the game and removes their score from the leaderboard. The prototype does not add a banning system, manual answer adjudication, or manual score adjustment.

## Round flow

1. Show the next prompt for the configured reading period.
2. Open answer submission for the configured answer period.
3. A rejected answer allows another attempt while time remains.
4. The first accepted answer is locked for that player. Show acceptance feedback only; keep its tier and points hidden.
5. Show players the accepted-answer count out of the eligible roster during answering and accepted waiting. Close submissions at the deadline or as soon as every eligible player has an accepted answer, whichever comes first. Players must explicitly press Submit before submissions close; typed but unsubmitted text is not automatically submitted.
6. Show the round results for the configured results period, including answer frequencies, awarded tiers and points, and the leaderboard.
7. Advance automatically to the next prompt. After the final prompt's results, show the final game results.

Other players' current-round answers and all current-round tier/point outcomes and score changes are withheld until the round results. Previously finalized totals and standings may remain available. Early closure begins the normal configured results period immediately; it does not skip the reveal.

## Answer matching

Match input against accepted answers and aliases in the JSON. Ignore capitalization, trim leading and trailing spaces, and collapse repeated internal spaces. Other spelling and punctuation variants require explicit aliases.

An alias maps to one canonical accepted answer for scoring, tier assignment, and frequency counting. There is no fuzzy matching or automatic typo suggestion feature.

An unlisted answer is rejected even if it would be valid in the real world. The player can retry before the deadline; the prototype has no in-game appeal or adjudication flow.

## Scoring and ranking

An accepted answer receives the point value of its assigned tier in the JSON. Other players choosing the same answer do not change its tier or score. Frequencies are descriptive round statistics only.

Each player contributes at most one accepted answer per round. A round with no accepted answer earns 0 points, including a timeout or a missed round during disconnection. An accepted answer assigned a 0-point tier is still distinct from a miss: it locks the answer and counts toward early completion.

Game totals accumulate points across rounds. Players with equal totals share their place, including joint winners. Answer speed does not break a tie. Use competition ranking, such as 1, 1, 3.

## Disconnection and removal

The game continues while a player is disconnected. Their accepted answer remains locked and their score is preserved. Reconnecting from the same browser restores that participant's current state. Missed rounds without an accepted answer earn 0. While disconnected, preserve the loaded page's draft but disable editing and Submit. Refresh clears unsubmitted text; accepted answers are restored from the server. No draft is automatically submitted.

Opening the game in a second tab in the same browser transfers control to the newest tab without creating another player. The older tab shows that the game is active elsewhere and cannot submit; scores and locked answers remain unchanged. It offers Take control here for an explicit transfer back, without automatic takeover on reconnection. A normal new tab and a controlling reload with valid continuation proof retain automatic behavior; stale or ambiguous copied/restored tab metadata requires that explicit takeover instead. Identifiers may persist across reload, but unsubmitted answer text does not.

Removing a player removes them from active play and the leaderboard. Retain their already accepted answers in the statistical record and treat the removed identity as no longer eligible for reconnection. This does not require a broader banning system or statistics-editing workflow.

## Results and subsequent games

After each round, show submitted-answer frequencies, each player's own tier and points, and the leaderboard. Also show an example of a highest-scoring accepted answer that nobody submitted, when one exists. Aliases count as submissions of their canonical answer, so an answer used through an alias is not eligible as an unused example. The example is selected from the remaining unsubmitted accepted answers using their assigned point values.

Round answer groups show canonical answers and counts without attaching player nicknames. Each player sees their own answer details; standings retain public round points and totals. Earlier-round browsing is deferred until the final recap, with no history overlay during timed play.

Grouped answers are ordered by assigned points descending, with JSON answer order breaking equal-point display ties. After the game, show the final leaderboard and each player's own answer-and-score recap. The noncompeting host sees joint winners, full standings, and expandable aggregate round recaps without individual player answer attribution. Results are available on-screen while the server runs. Downloads, saved game history, and recovery after a server restart are outside the first version.

Starting another game creates a fresh lobby and game code, replacing the previous game's temporary state and results.

## Prototype rules

The following rules complete the agreed prototype scope:

- Bundle gameplay interfaces, fonts and assets with the host application and serve them through its public tunnel origin. The tunnel provider and internet connection carry live game traffic.
- Bind the application listener to loopback and publish only the configured HTTPS origin through the owned connector. Enforce host/player authorization and bounded public admission. Generate invitations from trusted configuration and reject unexpected origins; a room code grants no host authority.
- Enforce the 100-player concurrent admission cap locally, including retained disconnected players. An additional new participant receives a full-game response without disrupting admitted players. Local hosting moves game load to the operator's hardware; the 100-player capacity target requires tests naming the hardware, host uplink, tunnel provider/plan and client networks.
- JSON content is text-only. Provide a sample file and schema documentation; authors edit files outside the app.
- Validate the entire file before opening the lobby. Report malformed JSON, missing required fields, unknown tier references, and aliases that map to conflicting answers after normalization. Invalid files cannot start a game.
- Tier point values are finite nonnegative integers. Timing values are finite positive numbers.
- Allow a game to start with at least one player, including for solo testing. Apply the 100-player cap to the admitted roster, preserving disconnected players' places for reconnection.
- Require nonempty nicknames unique within the game after case-and-space normalization. Keep names fixed after joining.
- Adopt the architecture's tunable metadata bounds: 256 waiting sessions, 8 registered pages per browser session, 1,000 total successful admissions per game including removed players, 128 pending unauthenticated handshakes, and bounded rejected-operation history. These limits never evict current players. After 1,000 distinct admissions, the host must create a fresh lobby for additional new players; valid resumes still work.
- Use competition ranking for ties, such as 1, 1, 3.
- Show answer frequencies as counts grouped by canonical answer, avoiding a separate percentage denominator rule.
- Keep accepted submissions in statistics after removal; a removed player identity cannot reconnect as an admitted participant. No broader ban system is required.
- Early completion checks all admitted, nonremoved players, including disconnected players. If none remain, let the timer expire rather than treating an empty roster as everyone having answered. If several unused answers tie for the highest points, show the first in the JSON answer order.
- The timer and submission deadline are shared across participants. Submit must reach the application server before the deadline; the countdown does not grant a separate window to each device.
- Only the host has access to setup and removal actions. Players receive no future prompts, answer sheets, or tier mappings before the appropriate reveal.
- A new game replaces the previous game's temporary state and results. Restarting the server loses the current game and its results.

## JSON contract

This contract defines the custom game file independently of server placement or technology stack. The adopted [architecture validation/resource defaults](ARCHITECTURE.md#import-and-resource-defaults) further constrain these shapes: safe-integer points and total maxima, 0.1–600-second durations representable in integer milliseconds, upload size, and string lengths. Implement one shared schema rather than a second, looser PRD-only validator.

| Field | Shape and behavior |
| --- | --- |
| schemaVersion | Required integer, initially 1. Unsupported versions are rejected. |
| title | Optional string, nonempty after trimming outer whitespace and at most 256 Unicode code points after that trim; defaults to Custom Game. Overlong titles are rejected, not truncated. |
| settings | Optional object containing readingSeconds, answerSeconds, and resultsSeconds. Each omitted duration uses its default. These settings apply to the entire game. |
| tiers | Required nonempty array. Each entry has a unique string id, a nonempty name, and nonnegative integer points. |
| prompts | Required ordered array of 1–20 entries. Each entry has a unique string id, nonempty text, and a nonempty answers array. |
| prompts[].answers[] | Each entry has nonempty canonical text, a tierId referencing a declared tier, and an optional aliases array of nonempty strings, defaulting to an empty array. |

Unknown extra fields are rejected recursively with field-specific errors. Canonical answers must be unique within their prompt after normalization. An alias cannot map to a different canonical answer or conflict with another canonical answer after normalization. Identical normalized variants for the same canonical answer can be deduplicated. Numeric durations must be finite and positive. Import errors identify the relevant field or array entry, and the host must correct the file before opening a lobby.

The example below demonstrates author-assigned scores and an explicit synonym. Its tier assignments are illustrative, not measured answer frequencies. A standalone [example game file](game.example.json) uses the same content.

```json
{
  "schemaVersion": 1,
  "title": "Season Picks",
  "settings": {
    "readingSeconds": 3,
    "answerSeconds": 25,
    "resultsSeconds": 10
  },
  "tiers": [
    { "id": "common", "name": "Common", "points": 10 },
    { "id": "uncommon", "name": "Uncommon", "points": 60 },
    { "id": "rare", "name": "Rare", "points": 100 }
  ],
  "prompts": [
    {
      "id": "seasons",
      "text": "Name one of the four seasons.",
      "answers": [
        { "text": "Spring", "tierId": "uncommon" },
        { "text": "Summer", "tierId": "common" },
        { "text": "Autumn", "tierId": "rare", "aliases": ["Fall"] },
        { "text": "Winter", "tierId": "uncommon" }
      ]
    }
  ]
}
```

## Acceptance criteria

The prototype is ready for functional review when it can demonstrate the following confirmed behavior:

1. A host uploads a custom JSON game defining prompts, answers, aliases, tiers, points, and timing.
2. Players on separate networks join the configured public HTTPS website with a game code and nickname; links and QR shortcuts reach that host instance and prefill the correct code.
3. The hosting setup supports one active game with a target of 100 players plus its admin interface. Capacity testing must name the server hardware, host uplink, tunnel provider/plan and client network conditions.
4. Start requires verified hosting readiness, closes new-player entry and automatically runs every prompt in file order through reading, answering, and results phases.
5. Omitted timing settings use 3-second reading, 25-second answering, and 10-second results defaults.
6. Case-and-space normalization and aliases match their canonical answer consistently. Rejected input permits retries before the deadline.
7. The first accepted answer is locked. Its tier and points stay hidden until round results, even when the player refreshes or reconnects.
8. Unsubmitted text and rounds with no accepted answer earn 0. Submissions after the deadline are rejected.
9. Assigned tier points stay the same regardless of how many players give that answer. Aliases group into one canonical frequency count.
10. Each round closes early once everyone eligible has an accepted answer, or otherwise closes at the deadline. It reveals results and the leaderboard for the configured results duration, then progresses automatically. Equal totals support shared places and joint winners.
11. A disconnected player can reconnect from the same browser with score and accepted answers preserved, without pausing the game.
12. The host can remove a player from play and the leaderboard.
13. The host page works as an optional shared display while each player can play fully on their own device.
14. Final results include the leaderboard and each player's recap. A subsequent game gets a fresh lobby and code.
15. Host and players complete a game through the public HTTPS tunnel from different networks, including a cellular player. All gameplay assets are bundled with the host. Startup failures and temporary tunnel loss are surfaced; an awake server continues timers and restores state on same-origin reconnection.
16. Round reveals include a highest-scoring unused accepted answer when one exists, treating aliases as their canonical answer.
17. Every prompt uses the same game-wide durations; prompt-level timer overrides are not required.
18. Invalid game files cannot open a lobby; import errors identify invalid fields, unresolved tier references, or conflicting normalized answers and aliases.
19. A game can start with one player. Names are nonempty, unique after normalization, and fixed after joining; disconnected admitted players retain their roster places within the 100-player cap.
20. Removed players' accepted answers remain in statistics, but the removed identity cannot reconnect. Early completion includes disconnected eligible players and requires at least one eligible player.
21. Players share an application-server deadline, and a submission must arrive before it. Setup actions and unrevealed answer data are unavailable to player roles.
22. Starting another game clears the previous game's state and results. A server restart does not restore a game.
23. The laptop remains authoritative for game creation, validation, timing, scoring and results. The operator-owned connector and provider carry browser traffic; codes remain instance-scoped. Launcher shutdown stops both processes, and credentials never enter invitations or release archives.
24. The origin listener is loopback-only, public host/origin checks and role authorization are verified, and unauthorized public requests cannot acquire host access. Underlying host-IP change preserves a surviving game at the same public origin; public-origin change requires a fresh game and invitation.
25. A game at the 100-player cap refuses an additional new participant while preserving admitted players' state and connections.

26. The host starts a managed hosting session from a local setup interface; the application starts and verifies one temporary tunnel, then offers a public link/QR without requiring a provider account, domain or manual connector commands. The local control interface and private host handoff are unavailable through the public endpoint.
27. Hosting remains available through final results until explicit Finish hosting or launcher shutdown. Browser closure does not stop it, repeated start/stop requests do not leak processes, and confirmed shutdown removes transient state and stops the owned listener/connector.
28. Same-origin interruptions preserve the surviving session under the existing timing rules. Permanent endpoint loss or a different public origin is surfaced locally and requires explicit fresh-session confirmation; previous invitations and memberships are never silently transferred.

## Deferred design and architecture decisions

The tunnel-first product and UI/UX baseline is accepted and the core/browser game is implemented. [E5-N01–N06](implementation/epic-05-npm-distribution.md) now deliver a local npm candidate with explicit connector preparation and installed-Mac verification; the [handoff](implementation/evidence/EPIC-5-NPM.md) distinguishes delivered implementation from remaining exact-target/physical lifecycle acceptance. The architecture defines the stack, npm/native distribution, platform floors, interruption policies, session protocol, and starting validation/resource limits. Public publisher identity/provenance, native signing/notarization and final clean-target release qualification remain Epic 6 work; neither the npm name nor a public release is claimed. Graphical iteration can continue independently. The optional information website remains separate from game sessions. Event date, expected attendance and the actual venue network remain operator inputs. Provider limits and suitability are qualification inputs; account/domain/credential provisioning applies only if a future optional named configuration is selected. Historic LAN, synthetic probes and archive evidence remain available without substituting for the installed npm evidence. See the [implementation tracker](IMPLEMENTATION-PLAN.md) for current completion status.

## Related documents

- [UI UX baseline](UI-UX.md)
- [Architecture baseline](ARCHITECTURE.md)
