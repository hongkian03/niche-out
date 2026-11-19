# Niche Out development and testing


> **Distribution implementation update:** The [npm migration](implementation/epic-05-npm-distribution.md) now produces a local compiled CLI tarball; it is not published or signed for public distribution. Hosts use Node `>=24.22.3 <25` without a compiler. Contributors retain Node 24.22.3/npm 11.19.1 and native build tools. Other target execution and final qualification remain explicit; see the implementation tracker. The networking baseline below is historical and is supplemented by the [networking report](implementation/evidence/NETWORK-IMPROVEMENTS.md) and [S02/S03 follow-up](implementation/evidence/EPIC-6-S02-S03-FOLLOWUP.md).

## Build and check the npm candidate

These are **contributor/maintainer** commands, not npm-host prerequisites. Start with the exact repository Node/npm toolchain and `npm ci`. The all-target native rebuild recipe currently runs on a macOS Apple Silicon build host and requires C/native toolchain inputs; it builds the Mac variants and cross-builds Windows/Linux using the pinned toolchain. Do not count those cross-builds as executed-platform tests.

```sh
npm ci
# Maintainer step when complete matching native inputs are not already available:
node scripts/npm/rebuild-native.mjs
npm run package:npm
```

`package:npm` builds the application, captures the source-file hash inventory, validates the native inventory, bundles private workspace code into separate server/import-worker entries, generates the runtime shrinkwrap from reviewed lock versions, copies source provenance and dependency notice texts, and packs `dist-npm/niche-out-0.1.0.tgz`. It does not publish. The private root workspace remains private. Assembly fails if any required target prebuild/inventory is absent or stale; see [native packaging](../packaging/README.md) for individual-target build inputs. Target-native CI/build machines can supply the four helper inputs before assembly.

Run the installed candidate without compiling it:

```sh
npm exec --yes --ignore-scripts --package=./dist-npm/niche-out-0.1.0.tgz -- niche-out --help
npm exec --yes --ignore-scripts --package=./dist-npm/niche-out-0.1.0.tgz -- niche-out prepare
npm exec --yes --ignore-scripts --package=./dist-npm/niche-out-0.1.0.tgz -- niche-out
```

Help/version perform no connector download. `prepare` explicitly verifies/acquires the pinned connector into a per-user cache; bare launch opens local setup and Start hosting can prepare the component. No install lifecycle hook downloads/builds it. Updating/uninstalling during a live game is unsupported: stop hosting and quit first. Cache entries are version/hash keyed and separate from package files. A warm cache avoids repeat connector downloads but does not remove the internet requirement for a Quick Tunnel.

```sh
npm run test:npm:install
```

This installs the actual tarball with scripts disabled into clean local/global/npm-exec environments outside the checkout, using an isolated npm cache. It tests CLI help/version and the bundled worker; reports include the installed package path for subsequent browser/game checks. It is distinct from the full production browser/tunnel and 100-player checks, which must be bound to the final candidate hash. macOS arm64 execution does not certify Windows, Linux, Intel Mac, physical sleep/wake, or publisher signing.

Additional installed-package checks (the browser and active-wrapper variants create their own temporary public tunnel):

```sh
node scripts/npm/check-native.mjs
node scripts/npm/smoke.mjs
node scripts/npm/check-wrapper.mjs --hosting
node scripts/npm/check-versions.mjs
```

The version check uses local test tarballs and a temporary user-owned prefix; nothing is published. Run capacity measurements separately from builds/browser tests, using the installed path from `work/npm-install/report.json`:

```sh
node scripts/load/run.mjs --npm-root="<installRoot>" --tunnel --players=100 --transport=mixed --games=1 --rounds=20 --diagnostics=light --uplink="<actual network>"
```

Only local development may repack changed bytes under the same provisional version. Use a fresh dedicated `--cache` directory for manual npm-exec tests of such repacks, or increment the local candidate version. Published versions must never be reused for changed bytes. The [npm handoff](implementation/evidence/EPIC-5-NPM.md) binds measurements to exact artifact hashes rather than version labels alone.

The supported runtime range belongs to the installed CLI; the source `npm run host` path below remains contributor-only with exact repository pins. Registry package naming/publication is still an Epic 6 task, so `npx niche-out` without a local package path is not an installation instruction yet.

## Networking investigation baseline

The [baseline report](implementation/evidence/NETWORK-BASELINE.md) records the current 100-player failures, instrumentation overhead, per-stage broadcast costs and actual-browser recovery checks. It links permanent summaries and raw working measurements. At the time of that baseline no retry, transport or broadcast optimization had been applied; subsequent networking changes and findings are linked above.

After building with the pinned runtime, preview or run the serial baseline suite:

```sh
npm run test:network:baseline -- --plan --uplink=eduroam
npm run test:network:baseline -- --out-dir=work/network-baseline/my-run --uplink=eduroam
# After capacity jobs have stopped, watch the production-browser recovery probe:
npm run test:network:browser -- --visible
```

Use a fresh output directory and supply your actual uplink label. The full suite runs local and real public-tunnel workloads; `--local-only` omits public jobs. A measured failure exits nonzero and remains in the generated report. These commands generate traffic against their own disposable application and tunnel. See [harness instructions](../scripts/load/README.md) for modes and measurement boundaries.

Epic 1 supplies pack/protocol/deployment contracts, deterministic fixtures, a verified tunnel connector installer and a synthetic public HTTPS test page. Epic 2 implements the deterministic game rules and private projections. Epic 3 connects that engine to the production game protocol. Epic 4 implements the complete host/player browser game and has passed its functional gate, including real iPhone QR/gameplay checks with the Mac on eduroam. See the [Epic 4 handoff](../docs/implementation/evidence/EPIC-4.md); broader device/capacity qualification remains Epic 6.

The managed hosting implementation now lives in `apps/server/src/hosting`, with its local and public browser assets in `apps/server/hosting-assets`. It provides automatic temporary tunnels, a separate authenticated local dashboard, public link/QR, private host access, and explicit recovery/shutdown. The launcher now starts the production game application; the public app now includes host setup, player admission, timed play, results, and recaps. See the [managed hosting handoff](../docs/implementation/evidence/EPIC-1-MANAGED.md) for actual evidence and outstanding checks.

## Run managed hosting

With the pinned Node runtime selected:

```sh
npm run host
```

The command builds the workspace and opens private local setup in your browser. Click **Start hosting**, wait for readiness, then share the public link or QR with a phone on cellular. The first connection can take a few minutes while the generated hostname propagates. **Open host page** establishes private host authority; do not share that private link. On the host page, upload a JSON game file, review its summary, and click **Create lobby**. Share the lobby QR/link with players, who enter a nickname. Click **Start game** once the crew has joined. The host browser administers the game and cannot also compete; use another browser profile or a phone for playing.

Keep the launcher terminal running. Closing a browser leaves hosting active. **Finish hosting** stops the public session and returns local setup to idle; a subsequent Start creates a new endpoint and fresh state. **Quit launcher** or Ctrl-C stops the controller too. Press Enter in the launcher terminal to reopen private setup if needed. There is no ten-minute managed-session expiry.

On a fresh development checkout run `npm ci` and `npm run setup:tunnel` first. The connector is already installed on the current Mac. Missing or damaged connectors produce actionable setup guidance. Self-contained private packages are now in `dist-release/`; see [portable packaging](../packaging/README.md) and the [Epic 5 handoff](../docs/implementation/evidence/EPIC-5.md).

```sh
npm run test:hosting
```

This historical Epic 1 regression starts a synthetic application and cleans up its own sessions. It checks local/public authority isolation, owner access, QR contents, browser continuity, connector interruption/recovery and fresh-session behavior. It needs installed Chrome and internet access. It does not establish 100-player capacity or event suitability.

## Build and verify

Use Node **24.22.3** with its bundled npm **11.19.1**. With nvm already available, run `nvm install` and `nvm use` here. With another runtime manager, select the exact version in `.nvmrc`. Run the following commands from this directory, keeping docs/ in place for the PRD example parity check.

```sh
npm ci
npm run typecheck
npm run build
npm test
node tests/fixtures/check-browser-assets.mjs
```

The four workspace packages share a lockfile. Build order is contracts, game-core, server, web. The generated `build/manifest.json` records runtime, platform, source digest, optional Git revision and exact dependency resolution. Installed packages, compiled output and run artifacts are excluded from source identity. Install and build are developer actions. The managed developer launcher is implemented in the Epic 1 expansion; self-contained private packages are available through Epic 5; public release qualification remains Epic 6.

## Exercise the game rules locally

```sh
npm run test:core
npm run demo:core
```

`test:core` runs the deterministic compiler, engine, privacy and multi-round tests. `demo:core` builds the contracts/core and plays two rounds with a controlled clock, so it completes immediately. Expect aliases to group together, a rejected answer followed by acceptance, a zero-point accepted answer, removal, an early round finish, joint winners Ada and Ben on 200 points, and a fresh empty replacement lobby. The last line is `PASS: deterministic core demonstration completed.`

Neither command starts hosting or needs a phone. `npm run host` opens managed hosting with the production server and playable host/player screens. See the [core API and server handoff](../packages/game-core/README.md).

## Exercise the production game protocol

```sh
npm run test:server
npm run test:game:tunnel
```

The first command builds the workspace and runs actual-listener, identity, recovery and import-worker tests. The second requires installed Chrome, the verified connector and internet access. It creates its own temporary tunnel, runs a two-round host/player game, checks replay/authorization and connector recovery, then closes the test browser and session. It prints a JSON `PASS` report when successful.

```sh
npm run probe:game
npm run measure:import
```

`probe:game` opens visible Chrome and prints a phone link for the cellular game and native Duplicate Tab checks. Follow the [protocol probe guide](../probes/game/README.md); the diagnostic assets are never served by the normal launcher. `measure:import` measures the real worker compiler with small and representative large packs. The production modules are in `apps/server/src/game`. See the [Epic 3 verification report](../docs/implementation/evidence/EPIC-3.md) for the actual provider, cellular, native-tab and test evidence.

## Exercise the browser game

```sh
npm run test:web
npm run test:web:layout
npm run test:web:tunnel
```

The first command runs browser-client and component tests. The layout harness serves isolated fixtures locally and uses installed Chrome to check responsive layouts, long text, zoom/reflow, modal focus, and reduced motion. The tunnel test uses the actual built app and production server to import a pack, invite players, play two rounds, exercise recovery, and review final recaps. It needs Chrome, internet access, and the installed connector. Test output and screenshots go under `work/web-ui/`; no fixture routes ship with the normal application.

```sh
npm run probe:web
```

This opens a visible host browser and an automatic player. Scan the host's QR using your phone on cellular, join as **Phone**, then submit **Fall** in round 1 and **Amber** in round 2. The host starts automatically after Phone joins. Both players should finish tied on 200. The test allows ten minutes per answer phase for manual checks; this is a test-pack setting, not a hosting-session expiry. Ctrl-C cleans up its own browser, server, and tunnel. For ordinary manual play, use `npm run host` and your own pack instead.

## Find the contracts

| Location | Use |
| --- | --- |
| `packages/contracts/src/pack.ts` and `text.ts` | Strict pack schema, defaults, field errors, display text and matching keys |
| `packages/contracts/src/deployment.ts` | Tunnel origin, configuration, ingress, secure-cookie and readiness contracts |
| `packages/contracts/src/protocol.ts` | HTTP/Socket.IO requests, replies, errors, raw bounds and mutation identity |
| `packages/contracts/src/session.ts`, `wire.ts`, `views.ts` | Discovery, page control, complete role/phase views and recap shapes |
| `tests/contracts`, `tests/protocol`, `tests/fixtures` | Validation, leak rejection, deterministic clock and reusable scenarios |
| `probes` | Isolated experiments using disposable state |
| `packages/game-core` | Compiled packs, deterministic engine and permitted role/phase projections |
| `apps/server/src/game` | Production listener, sessions/control, request ledger, worker imports and game dispatch |
| `apps/web` | Complete-view connection client, host/player screens, shared visual components and bundled assets |

[Example pack and authoring rules](../examples/FORMAT.md) · [Epic 1 results and hands-on checks](../docs/implementation/evidence/EPIC-1.md) · [Implementation backlog](../docs/IMPLEMENTATION-PLAN.md)

## Run individual investigations

After the build, `npm run probe:import` runs the worker and resource cases. On macOS with Command Line Tools, `npm run probe:platform` runs the clock and temporary power assertion tests. Both browser probes require a private IPv4 interface and installed Chrome. Use `npm run probe:lan` or `npm run probe:tabs`. Set `PROBE_BROWSER_PATH` to use a specific Chromium executable and `PROBE_LAN_IP` to select a private local interface when several are available. Each automatic browser run uses a temporary profile. The default listeners accept connections from the selected host address only.

## Try the public connection

Use the pinned Node runtime, then run from this directory:

```sh
npm run setup:tunnel
npm run probe:tunnel
```

Setup downloads and verifies the pinned cloudflared executable for this machine. It is already installed on the development Mac, so subsequent runs can start with `npm run probe:tunnel`. The probe builds contracts, starts a loopback server and opens a temporary Cloudflare tunnel. Wait for **Open on your phone** before opening the printed HTTPS URL. Fresh DNS names can take up to three minutes to become reachable.

Open the URL on an iPhone with Wi-Fi disabled. Expect **polling → websocket → ok** (or **Connected via websocket → ok**) and **Control generation 1**. Use **Test small upload**, reload after typing a draft, and **Reconnect transport**. Ctrl-C stops both local processes. The manual probe expires after ten minutes and each new run generates a new URL.

```sh
npm run probe:tunnel:test
npm run probe:tunnel -- --self-test
npm run verify:tunnel
```

The first command runs the public Chrome checks and closes the tunnel. The second checks the loopback handler locally. The third checks the installed connector against its manifest. See the [probe guide](../probes/tunnel/README.md) for full steps and the optional externally managed named-origin test. The [tunnel handoff](../docs/implementation/evidence/EPIC-1-TUNNEL.md) records actual results and remaining manual evidence.

This development probe uses synthetic membership state. The deterministic rules live in Epic 2; Epic 3 connects them to the production server and Epic 4 supplies the game screens. Managed temporary tunnels are the approved default direction. The public origin must remain consistent during a hosting session; a permanent hostname or provider account is not required. Provider suitability, capacity and venue qualification remain separate gates in the [backlog](../docs/IMPLEMENTATION-PLAN.md).


## Run the private portable build

On this Apple Silicon Mac, open `dist-release/Niche-Out-0.1.0-private-darwin-arm64/Start Niche Out.command`, or extract the matching `.tar.gz` elsewhere and open its launcher. It uses bundled Node, cloudflared and native helpers; no npm/build/download happens at startup. Keep the launcher open, click Start hosting, wait for readiness, open the host page, upload an example and share the player QR. Internet is required. Copy examples outside the package before editing them, since bundled files are integrity checked.

There are equivalent Intel Mac, Windows x64 and Linux x64 private archives. The user deferred their execution tests; cross compilation is not compatibility certification. These builds use test manifest signatures, not public publisher signing/notarization. See [Epic 5 evidence and manual checks](../docs/implementation/evidence/EPIC-5.md).

Contributor commands:

```sh
npm run build:platform
npm run package:download -- --target=all
npm run package:toolchain
# Build native target variants as documented in packaging/README.md, then:
npm run package:build -- --target=all
npm run test:packaging
npm run test:portable -- "path/to/extracted/Niche-Out-0.1.0-private-darwin-arm64"
```

The developer `npm run host` explicitly builds the native helper with a C compiler/Node headers before launching. Portable end users do not need a compiler. `test:portable` drives the extracted package's own runtime, dependencies and real tunnel, using the development Chrome driver only for automation.

## Epic 6 capacity, accessibility and release checks

Read the [Epic 6 report](../docs/implementation/evidence/EPIC-6.md) for measured workloads, actual failures/fixes and remaining evidence. Other-platform execution is deferred to the owner; public signing and release readiness are still separate from private Mac gameplay.

After `npm run build`, these checks run against compiled production modules:

```sh
npm run test:load -- --players=100 --games=30 --rounds=2 --idle-seconds=60
npm run test:load:tunnel -- --players=100 --games=3 --rounds=20 --transport=mixed
npm run test:load:tunnel -- --players=100 --games=3 --rounds=20 --transport=polling
npm run test:import:capacity
npm run test:web:layout
```

The load harness starts and cleans up its own application. The public variants require internet and the verified connector; the local variant needs no tunnel. They exercise simulated clients, not physical phones. Use the exact workload options in the [load report](../docs/implementation/evidence/EPIC-6-LOAD.md) to reproduce a particular measurement. Avoid other heavy activity while measuring latency/CPU. Raw output goes under `work/load/`, `work/epic6/` and `work/web-ui/`.

For the pinned developer-only accessibility audit, install its isolated tool once, then run:

```sh
npm install --prefix tooling/accessibility --no-save --package-lock=false axe-core@4.11.0
npm run test:accessibility
```

This uses fresh Chrome profiles and actual component fixtures. It does not certify VoiceOver/TalkBack speech, physical keyboards or every browser. Read [UI evidence](../docs/implementation/evidence/EPIC-6-UI.md) for the full viewport and keyboard scope.

Release preparation and private archive checks:

```sh
npm run test:packaging
npm run test:release
npm run test:package:assembly
npm run release:audit
npm run release:connector-inventory
npm run release:plan
```

Archive verification requires the four locally built archives; it extracts fresh copies, checks their inventories and leaves them under `work/epic6/` for native-target smoke tests. Connector inventory additionally requires Go's read-only binary metadata tool. `release:plan` intentionally exits with status 1 while printing the review-only plan and outstanding inputs; it never signs or publishes. See the [release guide](../docs/release/README.md), [owner decisions](../docs/release/OWNER-DECISIONS.md) and [individual requirement evidence](../docs/release/REQUIREMENT-EVIDENCE.md).

## Npm release preparation (E6-S06)

After rebuilding the local candidate, use `npm run test:release`, `npm run release:audit` and `npm run release:plan`. The audit verifies actual tarball bytes and source/lock/native/notices; it writes `work/release/npm-audit.json` and exits 0 on integrity success even while notice review is pending. The planner writes `work/release/npm-plan.json` and intentionally exits 1 with the remaining gates. Neither signs, publishes or requires a registry account. See the [release guide](release/README.md) and [S06 report](implementation/evidence/E6-S06-NPM.md). Rebuild when source files change; generated release evidence is excluded from its own source digest.
