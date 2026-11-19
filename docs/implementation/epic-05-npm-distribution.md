# Epic 5 extension: npm distribution

> **Owner closure, November 18, 2026:** Epic 5 and its six npm migration stories are complete for project progression. The owner will perform remaining manual/platform testing on their own schedule. Earlier qualification findings below remain the factual test record; closure does not turn NOT RUN checks into passes. Final release qualification remains Epic 6.

Implementation handoff, November 18, 2026, following the November 17 planning baseline. The owner authorized parallel development of all six stories. A standalone local npm candidate and installed-Mac verification are delivered; see the [npm implementation and test report](evidence/EPIC-5-NPM.md). The [master tracker](../IMPLEMENTATION-PLAN.md#epic-5-npm-distribution-extension) owns story status. Physical lifecycle acceptance and actual Intel Mac/Windows/Linux execution remain open; the prepared CI matrix is not an executed pass. No package has been published or publicly authenticated. Earlier portable archives and their evidence remain historical outputs, not npm acceptance evidence.

## Outcome and selected approach

The release target is **one public npm CLI package**. The delivered private candidate is `dist-npm/niche-out-0.1.0.tgz`, assembled through `npm run package:npm`; hosts install a supported Node runtime and launch Niche Out from a terminal. The browser dashboard and player experience remain the existing product. Package name `niche-out` is provisional until registry ownership/availability is checked. Installation tests use the local tarball, not an assumed registry publication. No publication or package reservation has occurred.

The tarball contains compiled server and import-worker entries, built browser/setup assets, four small native-helper builds, the connector version/hash catalogue, examples, MIT license and dependency/asset notices. It does not contain Node, a compiler, developer dependencies or four large cloudflared executables. At explicit **Start hosting** or `prepare`, obtain the matching pinned connector into a private per-user cache and verify it before execution. Subsequent sessions reuse verified cached bytes. Runtime acquisition is a disclosed setup operation; npm installation has no build/download lifecycle hook.

This choice keeps one version, tarball and publication transaction. Alternatives were assessed: four optional platform packages add coordinated publication and missing-optional-dependency handling; bundling every connector makes all users download large irrelevant binaries; postinstall acquisition fails when install scripts are disabled. None is the initial design. If native-helper packaging is unexpectedly large or fails clean-target OS validation, revisit the bounded packaging decision before adding another delivery channel.

## Explicit requirement replacements

| Previous portable requirement | npm requirement |
| --- | --- |
| Host needs only our extracted application, with bundled Node | Host installs supported Node/npm; npm delivers the compiled application |
| Four complete runtime-inclusive downloads | One npm tarball supporting four explicitly validated native targets |
| No dependency download during startup | No npm install hooks; disclosed pinned connector acquisition on explicit prepare/Start; verified warm cache performs no dependency download |
| Resource checks require `runtime/node` and extraction layout | Package-root resolver and manifest cover npm application/native resources; Node is checked separately |
| `.app`, signed native bootstrap and Linux archive signature define all trust | npm registry integrity/provenance define application delivery; project native authentication and actual OS validation remain separate release gates |
| Test extracted portable archive | Test the actual npm tarball installed outside the checkout, through local/global/npm-exec launch |
| Public release is a set of platform archives | Public release is a versioned npm CLI, authenticated native inventory, provenance, notices and exact target evidence |

The existing guarantee of a signed Windows bootstrap re-verifying all adjacent JavaScript is explicitly replaced by the normal npm installation trust boundary. Package-local hash checks detect accidental damage; a manifest stored beside altered JavaScript is not an independent authentication root. npm provenance is not OS code signing, notarization or proof of code safety. Existing native authenticity obligations remain visible in E6-S07–S10; this migration does not waive them.

No change to the 100-player limit, Quick Tunnel ownership, local/private/public listener boundaries, protocol 2, scoring, server deadlines, alias matching, owner recovery or no-restart-history behavior. Polling reliability, 8 GiB-host evidence, actual phones and physical-network tests remain separate qualifications.

## Supported runtime and platform contract

Implemented first-release host range: **Node `>=24.22.3 <25`**, enforced by a lightweight CLI check before server imports/native loading. Keep the contributor/build Node `24.22.3` and npm `11.19.1` pins distinct. Host npm is the npm supplied with supported Node 24; test the floor and current supported npm 11 tuple rather than enforcing the development patch on users. Release CI may require a separately pinned newer npm for publishing features. npm is the initially supported package manager; Yarn, pnpm and Bun are not implied.

| Host | Native tuple | Specific qualification |
| --- | --- | --- |
| macOS 15+, Apple Silicon | `darwin-arm64` | Native arm64 Node, native clock/idle assertion, helper/guard execution and OS authentication |
| macOS 15+, Intel | `darwin-x64` | Separate x64 prebuild and actual Intel execution |
| Windows 11, x64 | `win32-x64` | Command Prompt/PowerShell, x64 addon/connector, Job Object and terminal ownership |
| Ubuntu 24.04+, x64/glibc | `linux-x64` | Baseline glibc linkage, native clock, guard, logind/inhibitor and desktop opener |

Select by the running process's `process.platform` and `process.arch`, not just machine marketing architecture. Rosetta x64 Node uses x64 components; actual Intel evidence is still required. Windows/Linux ARM64, 32-bit Node, musl/Alpine and other Linux distributions are not first-release validated targets. `os`/`cpu` manifest arrays cannot express these exact tuple combinations; preflight must enforce them. Detect unsupported libc before native loading, with a clear diagnostic rather than a loader crash. OS-floor checks need actual release/build metadata (including Windows build information and Linux distribution/release data), not just platform labels or the presence of glibc; inject supported/unsupported OS facts in preflight tests and confirm them on actual target machines. Do not label all Linux compatible because one runner passes.

The delivered native builds use explicit stable Node-API level 8. Audit used APIs and test prebuilds on minimum/current Node 24. ABI stability does not make binaries portable across OS/CPU/libc. No user Python, Visual Studio, Xcode, node-gyp or native compilation fallback. Unsupported Node releases fail with the supported range and installation guidance; do not recommend `--force`.

## Delivery layout and mutable data

Actual local-candidate layout. The implementation preserves the original server/browser asset depth instead of the initially proposed flattened `dist/server`/`assets` layout; the installed launcher explicitly injects the separately bundled worker URL:

```text
bin/niche-out.cjs                         lightweight preflight and CLI dispatch
bin/runtime.cjs                           Node/OS/target checks and wrapper ownership
apps/server/dist/hosting/launch.js         bundled private workspace code
apps/server/dist/game/import-worker.js    separately bundled worker entry
apps/server/hosting-assets/local/         loopback setup assets
apps/web/dist/                            built browser, fonts and artwork
native/<target>/                          niche-platform.node and POSIX niche-guard
native-manifest.json                      four-target native hashes and provenance
resources.json                            application/helper inventory and requirements
scripts/cloudflared-manifest.json         pinned connector catalogue
scripts/notices/                          dependency and component notices
examples/ + docs/release/ + README.md + LICENSE
package.json + npm-shrinkwrap.json        exact external runtime dependency graph
```

The root monorepo stays private. `scripts/npm/assemble.mjs` assembles `dist-npm/package` with a separate manifest, `bin` entry, exact runtime dependencies and a strict `files` allowlist, then packs the candidate. Pinned build-time esbuild bundles private `@rarity/contracts` and `@rarity/game-core` sources into the server and worker; no unresolved workspace links or developer `node_modules` are shipped. Third-party runtime dependencies remain external. The generated **staging npm-shrinkwrap.json** locks the reviewed runtime graph; the root package-lock remains the contributor lock. Only selected release guides are shipped; their links to omitted source documents resolve to the source repository rather than broken package-relative paths.

Resource roots must be explicit/injected at module boundaries. Resolve package files from the module location and canonical package root, never from CWD, a source checkout, developer caches or assumed `../../` archive layout. Preserve the import worker's URL and all server-served asset/help/example routes. Installed files are immutable, including under global install, npm cache and read-only directories. A package manager's top-level symlink is valid; canonicalize the root before checking inventory paths, rejecting traversal and unexpected symlink escapes inside covered resources.

Cache base: macOS `~/Library/Caches/NicheOut`, Windows `%LOCALAPPDATA%\\NicheOut\\Cache`, Linux absolute `$XDG_CACHE_HOME/niche-out` or `~/.cache/niche-out`. Validate environment paths; fail clearly rather than writing to a system/temp/shared fallback. Connector entries are version/target/digest keyed. Store no game history or owner credentials there. Games remain in memory. Never repair, modify or download into package/CWD paths.

## Connector acquisition and cache rules

1. Package install, `--help` and `--version` do not download or start hosting. `niche-out prepare` explicitly verifies/acquires the connector without opening a public endpoint. Bare `niche-out` opens the existing local setup dashboard; Start hosting may acquire a missing component.
2. Allow only catalogue URLs/digests compiled into that package version. Enforce the existing byte limits, archive and executable SHA-256, pinned version output and target match before spawn. Never download `latest`, execute unverified files or accept browser-supplied executable paths.
3. Use private temporary files inside the final cache filesystem, validate archive contents before extraction, preserve executable bits and rename atomically. Reuse/refactor `scripts/install-cloudflared.mjs` verification logic; choose a tested bounded extraction implementation without shell interpolation. Extraction must not permit traversal, unexpected files or symlink escapes. Do not assume Bash or a user C toolchain.
4. Bound each attempt to 120 seconds, expose retry to the host, and cancel on quit/Finish hosting. Keep this preparation budget separate from the existing manager endpoint-readiness timeout; do not silently enlarge either to cover the other. Download failure must leave no trusted cache entry. Keep one per-cache-entry acquisition lock; a second launcher waits for at most 120 seconds and verifies the completed entry. Stale locks recover only after ownership/liveness checks; never kill an unrelated PID. Add deterministic concurrent/interrupt/stale-lock tests.
5. Verify cached executable bytes before use. A damaged entry may be reacquired on explicit prepare/Start; it must never run. Cache paths and identity should be captured by the active session so another package version cannot replace/delete in-use files, especially on Windows.
6. No automatic cache garbage collection in a live game. Initial design permits old content-addressed entries; document their bounded per-version sizes and removal only after all hosting processes stop. Automated pruning is deferred, not an untested background service.
7. Configure download proxy/CA behavior explicitly; npm registry proxy settings do not automatically configure application fetches. Download proxy support does not imply the cloudflared tunnel itself can traverse that proxy or a blocked venue uplink. Validate proxy support with an owned fixture and use trusted configured CA support without disabling TLS verification. Never print proxy credentials. A blocked corporate network gets actionable failure; do not promise it can be bypassed.
8. Installed assets and warm cache allow local setup without dependency acquisition. Cold offline setup reports that preparation requires connectivity. Quick Tunnel readiness/game hosting always needs internet. No offline-play promise is introduced.

## Stories and dependency order

The six implementation slices are delivered. The master tracker marks N01/N03/N04 DONE and N02/N05/N06 REVIEW, preserving the remaining exact-target and physical lifecycle acceptance. Current implementation entry points include `bin/`, `apps/server/src/hosting/{launch,resources,connector-cache}.ts`, `scripts/npm/`, `scripts/build-native-inventory.mjs`, `scripts/npm/check-native.mjs` and `.github/workflows/npm-compatibility.yml`. Consult the [handoff](evidence/EPIC-5-NPM.md) for actual files, executed commands, candidate hashes, installed-package load results and checks that remain NOT RUN. The story criteria below remain the completion contract; this summary does not replace missing platform evidence.

| Story | Size | Direct prerequisites | Reviewable result |
| --- | --- | --- | --- |
| E5-N01 | 1 | G4, existing launcher/core; this accepted direction | Runtime, CLI and resource contracts |
| E5-N02 | 2 | N01 | Four reproducible native prebuilds and selection |
| E5-N03 | 2 | N01 | Verified per-user connector preparation/cache |
| E5-N04 | 2 | N02, N03 | Independent installable npm tarball |
| E5-N05 | 2 | N04 | Browser setup, process ownership and update integration |
| E5-N06 | 2 | N05 | Actual packed-install compatibility and E6 handoff |

Default execution is N01 → N02 → N03 → N04 → N05 → N06, one bounded story at a time. If parallel development is authorized, N02 and N03 can proceed after N01 freezes their interfaces; one integrator owns shared launcher/resource files. Tests/prebuilds can use isolated target runners, but capacity measurements remain serial on each host. Sizes are relative 1/2 units, not days. If a story exceeds one cohesive review, keep its parent ID and split A/B children before implementation; downstream stories depend on the completed parent.

### E5-N01: runtime, CLI and resource contract

**Files:** `bin/{niche-out,runtime}.cjs`, `package.json`, `.npmrc`, `scripts/check-runtime.mjs`, `apps/server/src/hosting/{launch,resources,connector}.ts`, `apps/server/src/hosting/platform/index.ts` and runtime/resource tests. Root dev pins remain private; the staged package manifest is separate.

**Work:** Define Node/OS/libc preflight, package/native/cache root inputs, normalized diagnostics and command behavior. Introduce explicit configuration seams for web/help assets, platform addon, guard, connector catalogue and worker URL. Avoid a second launcher or tunnel manager. Minimal CLI must parse on unsupported runtimes sufficiently to print the version error before dynamic imports.

**Acceptance/tests:** Help/version work without browser, native loading, download or writes. Floor/current Node 24 pass; old/new unsupported majors and unsupported tuple/libc fail before starting listeners. Test unrelated CWD, paths with spaces/Unicode, Windows drive paths, package-root symlinks/read-only installation, absent resources and traversal attempts. Existing owner/origin/session behavior remains covered. Record supported host tuples, contributor pins and release-toolchain separation in one contract.

### E5-N02: four native prebuilds and component selection

**Files:** `scripts/build-platform.mjs`, `packaging/native/{platform,guard}.c`, `apps/server/src/hosting/platform/index.ts`, new native inventory/staging script, `tests/hosting/platform*.test.ts` and packaging tests.

**Work:** Produce minimal target-specific `.node`/guard files with explicit Node-API level and OS/libc baseline. Include all four small helper sets in one tarball. Generate final hashes after any signing step; keep native source/toolchain/target provenance. Select the running process's exact tuple and preserve clocks, idle protection and descendant ownership. Missing continuous clock/ownership is fatal; missing optional idle-inhibition capability retains the existing visible warning.

**Acceptance/tests:** Minimum/current supported Node load each target helper on its actual target; wrong OS/CPU/API, corrupt and missing files fail clearly. No compile-at-install fallback. Preserve Mac arm64/x64 separation and do not substitute Rosetta for Intel qualification. Windows tests cover parent Job Object restrictions and inherited/nested jobs, Ctrl-C/console close and abrupt Node exit. POSIX tests cover guard pipe EOF, parent death and descendant cleanup. Verify native inventory, linkage, executable modes and package size. Real sleep/wake tests remain identified separately from injected clocks.

### E5-N03: verified connector preparation and cache

**Files:** `apps/server/src/hosting/connector.ts`, `scripts/install-cloudflared.mjs`, `scripts/cloudflared-manifest.json`, new application cache/downloader module and focused fixture tests.

**Work:** Implement the acquisition/cache contract above with injectable downloader/filesystem/clock seams. Resolve a trusted connector path before passing it to the existing connector factory. Keep dev `CLOUDFLARED_PATH` behavior explicitly separated from release-host paths; no arbitrary public option can select an executable. Preserve integrity/version checking on every execution.

**Acceptance/tests:** All four catalogue entries resolve; cold/warm/corrupt/offline cases are distinct. Use local fixture servers to test byte/hash mismatch, interrupted response, timeout/cancellation, malicious archive members, proxy/CA handling and secret redaction. Two real processes preparing the same entry produce one verified final file; test stale lock recovery, locked executable and denied/noexec/cache permissions. Warm cache triggers no download. Never spawn an invalid component or alter active-session bytes. Real pinned-vendor acquisition on each supported target contributes to N06.

### E5-N04: independent npm tarball assembly

**Files:** new `scripts/npm/` assembly and publish-staging manifest; existing `scripts/{package-build,package-lib,build-manifest}.mjs` as reuse/reference; `apps/server/src/game/{application,imports,import-worker}.ts`, hosting resources, new `bin/`, package tests.

**Work:** Bundle private workspace code into separate server/worker entry points using a pinned build-time bundler if required; preserve ordinary third-party runtime module/resource resolution. Copy built web/setup assets, examples, MIT/license notices, native inventory and connector catalogue via an allowlist. Generate exact staging dependency/shrinkwrap data. Root workspace/build scripts remain contributor tools, not install hooks. Produce `npm pack --json` output without publishing.

**Acceptance/tests:** Inspect actual tar contents: no Node runtime, development tools, credentials, reference screenshots, test-only answer fixtures, workspace links or unneeded OS connectors. Install the `.tgz` with `--ignore-scripts` outside the checkout and outside ancestors containing developer `node_modules`, using isolated npm cache/prefix. The installed graph contains no unresolved `@rarity` imports or dev dependencies. Start server, load browser/font/setup assets, import a pack through the actual bundled worker and verify failures leave the previous game intact. Verify file modes, package hashes and inventory; all four helper resources are present. No application source build occurs on host installation.

### E5-N05: hosting setup, lifecycle and version changes

**Files:** `apps/server/src/hosting/{launch,manager,controller,resources,connector}.ts`, local deployment/status contracts if needed, platform adapter, `apps/server/hosting-assets/`, CLI entry, lifecycle tests, operator/README instructions.

**Work:** Bare CLI opens the existing authenticated local setup page. Start integrates cancellable acquisition before connector spawn and readiness. Model `Preparing tunnel component`, download/verify, connecting, ready and actionable retry states; expose no game invitation before public readiness. Keep preparation progress on the private local controller, separate from the public game protocol. Do not start the manager readiness clock until verified components are ready; fence cancellation against late acquisition completion. If a local status schema needs extension, update its fixtures and status mapping explicitly without silently changing the public wire contract. Preparing dependencies alone must not create a game/room or public endpoint. Preserve owner-link recovery and launcher lifetime; no new gameplay controls. Keep local/private access data out of shared URLs and structured logs.

**Acceptance/tests:** Repeated Start creates one acquisition/connector/session; quit during preparation cleans temporary work and cannot publish late readiness. Retry never spawns from corrupt state. Verify actual local/user-prefix-global/npm-exec invocations, Ctrl-C, terminal close, direct Node kill, npm wrapper-parent termination and session cleanup. If wrappers can leave an orphan CLI, implement a tested ownership solution or a tested exec-style launcher; do not accept it as an undocumented caveat. No background service.

Stop hosting and quit before an update. With stop-before-update observed, each process uses its selected version/resources; no application-driven hot replacement of helpers, connector or assets. An external npm update/uninstall during play is unsupported and cannot be assumed blockable by our CLI. Test stopped-host current→new→explicit prior version with shared cache, protection of versioned connector files used by other live sessions, and fresh server identity. Document that scores/history do not survive restart. `npx niche-out@<version>` is an illustrative pinned-version flow; do not publish operational commands as working until the package name/version exists. Browser auto-open failure stays actionable; headless-service support is deferred. Windows policy troubleshooting uses `.cmd`/Command Prompt rather than weakening global PowerShell execution policy.

### E5-N06: packed-install platform gate and release handoff

**Files:** new npm smoke/compatibility scripts and CI matrix, existing `scripts/test-portable-host.mjs` as scenario reference, `tests/packaging`, `docs/release/`, `implementation/coverage.md`; E6 owns final release-tool rewrite and publication.

**Work:** Freeze one candidate tarball and inventory. Install and execute those exact bytes on Mac arm64, actual Intel Mac, Windows 11 x64 and Ubuntu 24.04 x64. Test local install, user-owned global prefix and npm-exec/npx using isolated caches. Record resolved Node/npm versions, tuple, libc, native hashes and authentication state. Private unsigned candidate execution is valid E5 evidence; it does not pass public authentication. Final authenticated bytes are rebuilt and rechecked in E6-S07–S10. Carry forward relevant functional/network tests, not old archive pass claims. Run one installed-package 100-player mixed workload through its owned Quick Tunnel on the reference Mac and check scoring/identity/worker-resource behavior; label this separately from earlier source-layout benchmarks. Available-Mac work may proceed while other targets remain NOT RUN under the owner's existing testing deferral.

**Acceptance/tests:** Each target demonstrates cold preparation, warm reuse, setup, actual worker import, real Quick Tunnel QR/link phone joining, complete game, owner recovery, rejection/retry, refresh, reconnect, finish and shutdown. The matrix below is mandatory evidence where applicable. Run the actual production package, not workspace imports or a synthetic visual fixture. Re-run affected checks on the final authenticated native bytes in E6. Bind outcomes to tarball SHA-512/integrity and source/native/connector catalogues. Failed/missing targets remain REVIEW; cross-compilation is not execution.

Deliver the npm install/upgrade/troubleshooting guide, known limits, exact target reports and the E6 replacement-gate checklist. Retire portable assembly from the default release path only after npm replacements pass; do not delete historical evidence or simultaneously promise two primary release channels. Root README's live instructions change during implementation only once real local tarball commands work. E5-N06 closes migration implementation with scoped evidence; E6 still owns authenticated publication readiness.

## Compatibility test matrix

| Area | Required cases and response |
| --- | --- |
| Node/npm | Node range floor/current24, unsupported22/25/26 fail cleanly; host npm11 floor/current; explicit strict engines and ignored scripts; no host requirement for release-CI npm patch |
| Install paths | Empty/unrelated CWD; spaces/Unicode; Windows drive letters; read-only package; normal npm global executable symlink/shim; no elevation or package writes |
| Windows shell | Command Prompt, PowerShell and Windows Terminal; `.cmd` fallback if `.ps1` policy blocks the shim; argument arrays/no shell interpolation; scoped standard-user cache; x64 only |
| Process ownership | Direct CLI and npm/npx parent trees; close terminal, Ctrl-C, forced CLI kill, wrapper-only death; no orphan app listener, connector, guard or idle inhibitor |
| Native clocks/power | Existing continuous-clock and one-expired-phase recovery; wall-clock adjustment; real sleep/wake where hardware available; idle assertion release on finish/failure/quit |
| macOS native | Both CPU prebuilds, correct selection under Rosetta, clean target Gatekeeper/quarantine behavior; signing/notarization evidence applies to actual native payloads, not a fictitious signed npm script |
| Linux native | Ubuntu baseline glibc; detect musl; missing systemd-inhibit/logind gives existing warning; missing xdg-open gives actionable browser-opening error; noexec permissions diagnosed |
| Connector cache | Cold/warm/corrupt; two preparers; killed download; stale lock; locked Windows executable; offline first use; proxy/CA; version changes; no arbitrary URL/path; no in-game pruning |
| Package/runtime | Exact tarball, real worker, external runtime graph/shrinkwrap, no hidden workspace/build files; assets/notices; package corruption and missing helper tests |
| Hosting/game | Private controller isolated from tunnel, readiness-gated QR, same-origin identity/tab recovery, timers/scoring, final results, no hot update or restart recovery |

## Epic 6 replan and release prerequisites

Keep existing E6-S01–S05 capacity/device/accessibility evidence; rerun affected deployment paths after bundling. Their unresolved conditions do not disappear. Original E6-S06–S12 IDs stay stable but their artifact criteria are replaced explicitly in [the release epic](epic-06-validation-release.md):

- **S06:** npm manifest/version/license/notices/source/native/dependency/connector inventory; revise `scripts/release-{plan,audit}.mjs`, `packaging/release/candidate.json` and tests so obsolete `.app`/bundled-runtime gates cannot block or falsely pass npm candidates.
- **S07–S09:** prepare and verify appropriate native payload authentication on Mac/Windows/Linux and npm release integrity/provenance, replacing standalone container recipes. Owner credentials and clean-target OS behavior remain gates. No claim that registry provenance replaces OS signing; notarization mechanics must be demonstrated for the chosen native payload carrier rather than assuming a ticket can be stapled to an npm tarball.
- **S10:** clean install of final exact tarball, authenticated native bytes and verified downloaded connector across all four targets, cold/warm setup and tamper checks.
- **S11:** updated requirement coverage and known-limit review; provenance, dependency notices and unresolved hardware/network evidence explicitly accounted for.
- **S12:** separately authorized npm publication and channel promotion; no package/version is uploaded by N01–N06. Use one candidate version, verify registry integrity/provenance and clean installation before promotion. Publishing even a candidate tag is public distribution and requires approval. Registry attestations do not exist before that action: S06–S11 verify local exact bytes and publisher configuration, then S12 verifies registry signatures/provenance after candidate upload and before stable promotion. There is no pre-publication gate that requires an already published package. Published versions are immutable; choose a new version for changed bytes, and use a prior explicit version/channel for rollback after stopping hosts.

Existing MIT selection is reused, not asked again. Missing owner inputs are package namespace/ownership, legal publisher details, publication credentials/trusted-publisher setup and native signing credentials. Prepare local tarballs/tests without them. Release CI should use an explicitly pinned compatible npm/OIDC toolchain separate from the developer/host pins; verify current publishing and dist-tag requirements when implementing, rather than embedding a stale minimum in runtime code.

## Definition of migration done

One local npm tarball installs without hooks/compiler and contains every required app resource. All supported targets select working prebuilt helpers, prepare/verify the proper connector, and preserve launcher/game behavior. Each required executed target has evidence or an explicit owner-deferred gap; missing targets do not count as Done. Default release tooling/docs point to npm, historical archive evidence stays dated, and E6 has a coherent final-native/npm authentication path. No registry publication, claim of all-polling reliability or 8 GiB certification follows from building a tarball.

## Primary references

- [npm package manifests, bin, engines and files](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)
- [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/) and [publishable CLI shrinkwrap](https://docs.npmjs.com/cli/v11/configuring-npm/npm-shrinkwrap-json/)
- [Node-API stability](https://nodejs.org/api/n-api.html)
- [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/) and [provenance limits](https://docs.npmjs.com/generating-provenance-statements/)
- [PowerShell execution policies](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies), [Windows nested jobs](https://learn.microsoft.com/en-us/windows/win32/procthread/nested-jobs)
- [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) and [systemd-inhibit](https://www.freedesktop.org/software/systemd/man/latest/systemd-inhibit.html)
