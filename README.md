# Niche Out

## About

Niche Out is a custom multiplayer trivia game inspired by Krillion. Players compete to come up with the most niche answer to each prompt.

Build a game using a JSON file containing prompts, accepted answers, spelling aliases, and tiers. The game maker assigns each tier its points. After each round, everyone sees the answers, how many people chose them, and the standings.

The host runs the game on their own computer and manages it through a browser. Players join on their phones or computers using a QR code or link. A temporary Cloudflare tunnel lets everyone connect from different networks, with internet access required for both the host and players.

- Automatic timed rounds, answer reveals, and leaderboards.
- Custom games with up to 20 prompts.
- Browser-based play without player accounts or installations.
- A shared host screen and player removal controls.

Niche Out is under active development. Testing has covered 100 simulated players using a mix of WebSocket and polling connections; polling-only reliability and broader platform compatibility are still being verified. See the [testing report](docs/implementation/evidence/EPIC-6.md) for current results and limitations.

## Why I made this

Normally for Boston University Singapore Student Association's annual Great Singapore Social event, we play jeopardy or kahoot. However, during a meeting someone suggested a multiplayer Krillion since (at the time of development) it's a fairly new online game.

## How to download

[Download the source ZIP](https://github.com/hongkian03/niche-out/archive/refs/heads/main.zip) and extract it, or clone the repository:

```sh
git clone https://github.com/hongkian03/niche-out.git
cd niche-out
```

Self-contained app downloads are being prepared. The current portable builds are private test packages, and public signing and distribution are still in progress. To run the source, follow the setup steps below.

## How to use

### Set up the host

The source setup requires **Node.js 24.22.3**, **npm 11.19.1**, and a C compiler with matching Node headers for the native hosting helpers. On macOS, install the Xcode Command Line Tools if needed:

```sh
xcode-select --install
```

If you use nvm, select the project's pinned Node version:

```sh
nvm install
nvm use
```

From the project directory, install dependencies, download the verified tunnel connector, and launch:

```sh
npm ci
npm run setup:tunnel
npm run host
```

The host command builds the app and opens the local hosting dashboard. For native build prerequisites and other platform details, see the [development guide](docs/DEVELOPMENT.md) and [packaging guide](packaging/README.md). Available-Mac testing is documented; Windows, Linux, and Intel Mac execution checks remain pending.

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