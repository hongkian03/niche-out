# Niche Out

## About

Niche Out is a custom multiplayer trivia game inspired by Krillion. Players compete to come up with the most niche answer to each prompt.

Build a game using a JSON file containing prompts, accepted answers, spelling aliases, and tiers. The game maker assigns each tier its points. After each round, everyone sees the answers, how many people chose them, and the standings.

The host runs the game on their own computer and manages it through a browser. Players join on their phones or computers using a QR code or link. A temporary Cloudflare tunnel lets everyone connect from different networks, with internet access required for both the host and players.

- Automatic timed rounds, answer reveals, and leaderboards.
- Custom games with up to 20 prompts.
- Browser-based play without player accounts or installations.
- A shared host screen and player removal controls.

## Network limitations

**Connection reliability and large-game performance are not guaranteed.** The game runs on the host's computer and relies on its internet connection and a temporary Cloudflare Quick Tunnel to reach players. Both the host and players need internet access, even though the server runs locally.

- Large groups and simultaneous reconnects can cause slow updates, delayed answer confirmations, or submission timeouts. The 100-player admission limit is not a guarantee of smooth play with 100 players.
- Some school, workplace, or public networks may block or interrupt WebSocket connections. The polling fallback uses more HTTP requests and can encounter tunnel request limits.
- Temporary tunnel addresses can take a few minutes to become reachable. DNS issues, provider interruptions, or the host losing connectivity can disrupt a session.
- Keep the host computer awake and the launcher running. If hosting must restart with a new public address, players need a fresh invitation and game; previous results are not saved after the server stops.

Try the game with your intended devices, player count, and network before an event, and have a backup activity available. See the [operator guide](docs/release/OPERATOR-GUIDE.md) for connection troubleshooting.

## Why I made this

Normally for Boston University Singapore Student Association's annual Great Singapore Social event, we play Jeopardy or Kahoot. However, during a meeting someone suggested a multiplayer Krillion since (at the time of development) it's a fairly new online game that has gone viral and is very popular. Hence, I embarked on this project, but also decided to make it open source and general use, so that others may also use it as a locally-hosted party game.

## How to download

The project now builds a **local npm candidate**, `dist-npm/niche-out-0.1.0.tgz`. It is not published to the npm registry yet. Obtain that file from the maintainer, or build it from a source checkout using the [development guide](docs/DEVELOPMENT.md#build-and-check-the-npm-candidate).

Hosts need supported **Node.js `>=24.22.3 <25`** with npm. The candidate contains compiled application assets and prebuilt native helpers; installing/running it requires no compiler or application build. Players need only a browser.

For contributors, [download the source ZIP](https://github.com/hongkian03/niche-out/archive/refs/heads/main.zip) or clone the repository:

```sh
git clone https://github.com/hongkian03/niche-out.git
cd niche-out
```

The intended targets are macOS 15+ Apple Silicon/Intel, Windows 11 x64 and Ubuntu 24.04+ x64/glibc. Available-Mac execution is tested separately; native cross-builds alone do not certify Intel Mac, Windows or Linux compatibility. Earlier self-contained archives are historical private test builds.

## How to use

### Set up the host

With supported Node/npm installed, run the local candidate from the repository directory:

```sh
npm exec --yes --ignore-scripts --package=./dist-npm/niche-out-0.1.0.tgz -- niche-out
```

If the tarball is somewhere else, replace the package path with its quoted absolute path. This uses the local file, not a published `niche-out` registry package. npm installs the candidate's runtime dependencies; there are no install hooks or native build steps. An optional preparation command verifies/downloads the tunnel component without starting hosting:

```sh
npm exec --yes --ignore-scripts --package=./dist-npm/niche-out-0.1.0.tgz -- niche-out prepare
```

The normal command opens the private local hosting dashboard. **Start hosting** verifies the user-cached cloudflared executable and downloads the pinned component if missing; progress and errors appear in setup. Cold preparation and tunneled play need internet. Keep the CLI terminal open; Ctrl-C or **Quit launcher** stops it. Stop hosting and quit before updating or uninstalling the package.

Windows hosts can use Command Prompt or the npm `.cmd` launcher if PowerShell blocks its `.ps1` shim. Do not weaken machine-wide execution policy. Source-contributor commands such as `npm run host` still require the exact development toolchain and native build prerequisites described in the [development guide](docs/DEVELOPMENT.md).

### Host a game

1. Click **Start hosting** and wait until the session is ready. A new temporary address can take a few minutes to become reachable.
2. Click **Open host page** and upload a game JSON file.
3. Review the game summary, then click **Create lobby**.
4. Share the lobby's player QR code or join link. Players enter a nickname; they do not need to use your Wi-Fi.
5. Click **Start game** once everyone has joined. New players cannot join after the game starts.

The host manages the game and does not compete. Keep the launcher running throughout the session. Closing the browser leaves the game running; use **Open host page** to return. **Finish hosting** ends the session, and **Quit launcher** shuts down the application. Games and results are held in memory and are lost when hosting stops.

Share the player invitation only; keep the private host-access link to yourself. A game code is used at that host's game site, rather than through a global code lookup.

### Play a game

Scan the host's QR code or open their join link, enter a nickname, and wait for the host to start. Submit an accepted answer before the timer ends. Rejected answers can be retried; the first accepted answer locks. Its tier and points are revealed at the end of the round.

Rounds advance automatically. The highest total wins, and tied players share a place. If your connection drops, return using the same browser to recover your player identity and accepted answers.

### Make your own game

Start with one of the [example game files](examples/):

- [One-round example](examples/game.example.json) for a quick check.
- [Five-round example](examples/game.five-rounds.json) for testing the game flow.

Copy an example, edit its prompts, answers, aliases, tiers, and timers, then upload it through the host page. Scoring follows the tiers in the JSON; answer popularity during play does not change the points. See the [game format guide](examples/FORMAT.md) for the full structure and validation rules.

For recovery and troubleshooting, read the [operator guide](docs/release/OPERATOR-GUIDE.md). Developer setup, test commands, and project structure are in the [development guide](docs/DEVELOPMENT.md).

## Credits

- **Krillion** — inspiration for the niche-answer gameplay and visual direction. Thanks kp.
- **The VT323 Project Authors** — the [VT323 font](https://github.com/google/fonts/tree/main/ofl/vt323), distributed under the [SIL Open Font License](apps/web/public/VT323-OFL.txt).
- **Cloudflare** — [cloudflared](https://github.com/cloudflare/cloudflared), used to connect players to the host's computer through a temporary tunnel. Its [license notice](scripts/notices/cloudflared-LICENSE.txt) is included in the project.
- **React, Fastify, Socket.IO, and the project's other dependencies** — the libraries behind the interface, server, and real-time connections.

The ocean scenery, submarine, and other decorative graphics are original project SVG/CSS artwork. See the [asset notices](apps/web/public/asset-notices.txt) for details.

## License

Licensed under the [MIT License](LICENSE).
