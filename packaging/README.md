# Private portable packages (Epic 5)

These are contributor build recipes. End users extract a complete archive and launch it; they do not install Node, download dependencies or compile anything at startup. Public signing/notarization and publisher authentication remain Epic 6.

## Assembly prerequisites

Use pinned Node 24.22.3 and the checked-in npm lockfile. Run `npm ci` and `npm run build` in the project first. Build tools need `curl`, `tar` (BSD tar supports Windows zip extraction/creation), a C compiler and Node headers. Linux assembly of the Windows zip also requires `zip`. On Windows, use its bundled bsdtar/curl and Visual Studio C tools, or build all packages on the documented Mac contributor environment. Target-only execution testing is separate from assembly.

```sh
node scripts/package-download.mjs --target=all
node scripts/package-toolchain.mjs
```

The first command downloads Node 24.22.3 and cloudflared 2026.11.0 for four targets, checks pinned archive and connector hashes, and extracts into `tooling/package-cache/`. Cached downloads are verified again. The second installs the checksum-pinned Zig 0.17.1 cross compiler on macOS arm64 and the official Windows Node import library. Neither command is used at game startup.

Node pins are in `packaging/node-manifest.json`, taken from the official release checksum file. Cross-toolchain pins are in `packaging/toolchain-manifest.json`; connector pins remain `scripts/cloudflared-manifest.json`. All are HTTPS-source hash pins, not a new project signature.

## Native helpers

Run these from the project directory, replacing the absolute root below with your checkout path. Use quoted paths for directories with spaces. The compiler executes only at build time.

```sh
node scripts/build-platform.mjs --target=darwin-arm64 --headers="$PWD/tooling/package-cache/node-v24.22.3-darwin-arm64/include/node"
node scripts/build-platform.mjs --target=darwin-x64 --headers="$PWD/tooling/package-cache/node-v24.22.3-darwin-arm64/include/node"
node scripts/build-platform.mjs --target=linux-x64 --headers="$PWD/tooling/package-cache/node-v24.22.3-darwin-arm64/include/node" --cc="$PWD/tooling/package-cache/zig-aarch64-macos-0.17.1/zig" '--cc-args=["cc","-target","x86_64-linux-gnu"]'
node scripts/build-platform.mjs --target=win32-x64 --headers="$PWD/tooling/package-cache/node-v24.22.3-darwin-arm64/include/node" --node-lib="$PWD/tooling/package-cache/node-win-x64.lib" --cc="$PWD/tooling/package-cache/zig-aarch64-macos-0.17.1/zig" '--cc-args=["cc","-target","x86_64-windows-gnu"]'
```

Native target builds can instead use `cc` on Linux or `cl` with the appropriate Windows import library. Outputs are under `tooling/platform/<target>/`. The current platform build also installs developer helpers into `tooling/`.

## Assemble and verify

```sh
node --test tests/packaging/package.check.mjs
node scripts/package-build.mjs --target=all
```

Assembly uses explicit application paths, production lockfile dependencies, and copied workspace packages (no symlinks into the development checkout). Node is read from a verified archive; connector bytes are rechecked. Each output contains `portable-manifest.json` with relative resource hashes and a source-manifest digest, an Ed25519 `portable-manifest.sig`, and an adjacent archive `.sha256` file. Each private build generates an ephemeral test key in memory; only the public key is embedded in the bootstrap. This tests the signing boundary but does not authenticate a publisher: Epic 6 must sign the bootstrap itself. Do not edit bundled files in place; copy examples elsewhere before editing. Missing native helpers fail assembly rather than generating a misleading incomplete archive.

Outputs: `dist-release/Niche-Out-0.1.0-private-<target>/` and matching `.tar.gz` (Mac/Linux) or `.zip` (Windows). Each archive includes a visible launcher, Node runtime/license, connector/notices, native helpers, compiled server/web, production dependencies and examples. It excludes development tools, caches, credentials, raw private sessions and source tests. Existing private output folders of the exact target name are replaced when rebuilding.

Linux targets Ubuntu 24.04+ x64/glibc. Runtime prerequisites include a graphical default browser and `xdg-open` for automatic opening; `systemd-inhibit` with logind is needed for idle inhibition. Missing inhibition is reported locally. macOS target floor is 15; Windows target floor is Windows 11 x64.

## Evidence boundaries

The owner explicitly deferred Intel Mac, Windows and Linux compatibility execution on 16 November 2026. Cross compilation and valid archive checks do not establish target compatibility. Record actual Mac package gameplay/lifecycle checks in the Epic 5 evidence report; defer other-platform checks visibly. This does not certify public signing, Gatekeeper/SmartScreen delivery, physical sleep/wake on untested devices, or 100-player capacity.
