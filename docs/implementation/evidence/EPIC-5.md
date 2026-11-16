# Epic 5 — portable hosting implementation handoff

Delivered November 16, 2026 using three parallel implementation agents and a coordinating integration/review pass. **All ten stories have implementation/deliverables; available Apple Silicon Mac execution passes.** The owner explicitly deferred Intel Mac, Windows and Linux compatibility testing. Original full G5 certification remains in review: physical Mac sleep/wake and clean-machine delivery have not been performed either. No claim is made that cross compilation establishes platform compatibility. Story status lives in the master tracker.

## What changed

- `apps/server/src/hosting/launch.ts`: reusable `launchHosting`, packaged resources, native clock/power wiring, private opener, owner recovery, cleanup and clear runtime errors.
- `resources.ts`: strict relative-path/resource inventory, missing/corrupt resource errors, target/runtime checks, symlink rejection and SHA-256 checks.
- `platform/index.ts` and `packaging/native/platform.c`: synchronous suspension-aware clocks; scoped active-game power protection. Mac uses mach continuous time and IOKit; Windows uses GetTickCount64, execution state and kill-on-close Job Objects; Linux uses CLOCK_BOOTTIME and systemd idle inhibition. Warnings stay in the local launcher.
- `packaging/native/guard.c` and `connector.ts`: POSIX ownership-pipe/process-group supervision, bounded termination, descendant cleanup on parent death, actual connector PID preserved via dedicated handshake. Windows relies on the launcher's Job Object.
- `apps/server/src/game/application.ts`: private active-phase callback and explicit one-phase interruption reconciliation; accepted answers retained, expired answers rejected, next phase gets full duration. Public URL changes still require a new application/session. Gameplay rules are otherwise unchanged.
- `scripts/package-*.mjs`, `packaging/`: pinned build-time downloads, native cross compilation, explicit production-file selection, copied workspace dependencies, archive assembly and checksums.
- `packaging/portable-start.mjs`: verify the test-signed manifest and builtin-only verifier before importing game code. Per-build Ed25519 private keys exist only in memory and are never included. These test signatures do not authenticate a publisher; signed executable/bootstrap delivery remains Epic 6.
- `scripts/test-portable-host.mjs`: developer browser driver runs the extracted application's bundled runtime and dependencies through a real temporary tunnel. Private setup URLs travel through IPC, not logs.

## Delivered artifacts

All four packages are in `dist-release/`, accompanied by `.sha256` files and extracted staging folders. Each contains Node24.22.3, cloudflared2026.11.0, native helpers, compiled server/web, production dependencies, examples, license notices and a visible launcher. Startup needs no build, Node installation, account/domain setup or dependency download. Internet is needed for hosting.

| Target | Archive | Evidence |
|---|---|---|
| Apple Silicon Mac | `Niche-Out-0.1.0-private-darwin-arm64.tar.gz` | Native/package/browser checks on available Mac |
| Intel Mac | `Niche-Out-0.1.0-private-darwin-x64.tar.gz` | Cross-built; execution deferred to owner |
| Windows x64 | `Niche-Out-0.1.0-private-win32-x64.zip` | Cross-built; execution deferred to owner |
| Linux x64 | `Niche-Out-0.1.0-private-linux-x64.tar.gz` | Cross-built; execution deferred to owner |

`dist-release/assembly-verification.json` records all archive hashes, signature/resource checks and source identity. `source-build-manifest.json` preserves the assembly snapshot even after documentation changes. `mac-verification.json` records Mac test scope. Archive hashes are intentionally not regenerated merely for later handoff-document edits.

## Verification performed

- Full regression: **431 tests in 32 files**, build, typecheck and **15 served browser files** privacy scan passed.
- **4 packaging checks** passed, including modified manifest/signature/key rejection. After final cleanup fixes, **32 affected tests** passed again.
- Actual Mac **macOS26.5.2 build25F84, arm64**: native clock progression, scoped idle assertion acquisition/release, guard cleanup including connector-like descendants after EOF and forced parent SIGKILL.
- Extracted arm64 archive under `work/portable smoke é/`, independent of workspace dependencies. Real shell launcher passed from unrelated cwd with system PATH containing no Node, and cleared unsafe inherited Node/connector overrides. Startup then graceful SIGTERM passed with browser opener stubbed for that isolated check.
- Separate real Chrome/browser flow using bundled runtime: private local setup, public tunnel readiness, import/commit, player join, two-round game, final200, closing/reopening owner browser, retained final results and explicit quit all passed. This uses a real public HTTPS tunnel but same-machine browser contexts, not a fresh phone/cellular or venue-capacity claim.
- Tampering with copied packaged HTML rejected startup; tampering with manifest bytes rejected its signature. Original test-copy bytes restored afterward. Original archives were never changed.
- Owned test servers, connector and guard processes were absent after shutdown. No system sleep, network reconfiguration or clock-setting action was applied to the user's working machine.

## Manual verification remaining

On this Mac, extract the archive elsewhere, open **Start Niche Out.command**, and run the Singapore pack with a phone. Check that closing the host browser preserves play and Open host page restores access. During a convenient test, deliberately sleep and wake the Mac: if the public URL survives, accepted answers should remain, at most one expired phase closes, and the next phase receives its full duration. If the endpoint cannot recover, finish/start creates a fresh session; old identities do not migrate. Quit the launcher and verify the session stops. Deliberate wall-clock-change and actual terminal-window-close checks are also still manual.

Intel/Windows/Linux: the owner will perform extract/launch/public join/game/owner recovery/power/suspend/quit checks on their own schedule. Windows starts **Start Niche Out.cmd**; Linux starts **start-niche-out.sh**. Supported floors remain macOS15+, Windows11x64, Ubuntu24.04+x64. Linux graphical-browser and systemd/logind prerequisites are documented in each archive.

These are private test builds. Public publisher signing/notarization, clean-machine Gatekeeper/SmartScreen checks, full device/accessibility qualification and measured100-player capacity remain Epic6. No public upload or release was performed.

## Handoff

Implementation is delivered; remaining work is the explicitly recorded verification above. G5's original all-target/physical-lifecycle evidence is not claimed complete. Epic6 preparation can be separately authorized with those verification items carried forward. See `packaging/README.md` for reproducible recipes. Future agents should preserve the distinction between implementation, compiled artifacts, available-Mac execution and deferred target evidence.
