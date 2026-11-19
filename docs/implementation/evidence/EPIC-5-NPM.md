# Epic 5 npm migration: implementation and verification

> **Owner closure, November 18, 2026:** Epic 5 and its six npm migration stories are complete for project progression. The owner will perform remaining manual/platform testing on their own schedule. Earlier qualification findings below remain the factual test record; closure does not turn NOT RUN checks into passes. Final release qualification remains Epic 6.

Implementation handoff, November 18, 2026 (America/New_York; raw UTC timestamps extend into November 19). The owner authorized parallel implementation of E5-N01–N06. Three agents owned CLI/native work, connector caching and package assembly; the coordinator integrated launcher preparation and verified the actual installed package. No npm registry upload, project signing, commit or push occurred.

All six stories have implementation deliverables. **Full platform/lifecycle qualification is still in review.** The available execution target is Apple Silicon macOS, Node 24.22.3/npm 11.19.1. Intel Mac, Windows 11 and Ubuntu execution remains owner-deferred; a cross-compiled payload is not a passing target test. The [master tracker](../../IMPLEMENTATION-PLAN.md#epic-5-npm-distribution-extension) distinguishes delivered implementation from acceptance.

## What changed

| Story | Delivered implementation | Evidence boundary |
| --- | --- | --- |
| N01 | Lightweight `bin/niche-out.cjs`, Node/OS/architecture/glibc preflight, explicit package roots and package-resource integrity checks | CLI help/version, injected unsupported runtime/OS facts, unrelated paths, resource corruption/traversal cases and installed read-only package |
| N02 | Node-API 8 helpers for four tuples, POSIX guards, target/hash inventory and reproducible maintainer rebuild recipe | Apple Silicon native execution passed; Intel/Windows/Linux execution and final native authentication remain open |
| N03 | Explicit verified connector acquisition, content-addressed private user cache, atomic cross-process locking, cancellation, bounds, proxy/CA support and sanitized errors | Local hostile/error fixtures, concurrent processes, version coexistence and real vendor cold/warm preparation on Mac |
| N04 | Compiled server and separate import worker; production browser/setup assets; exact external dependencies/shrinkwrap; examples/notices and strict npm pack inventory | Actual tarball local/global/npm-exec installs with ignored scripts outside checkout; no bundled Node, connector executables or host compiler |
| N05 | Existing local dashboard/manager integrated with private preparation progress, cancellation and verified readiness; npm ancestor ownership and stopped-host update guidance | Installed browser game, recovery, explicit quit and active npm-wrapper death passed; platform/physical terminal cases remain listed below |
| N06 | Installed-package/native/browser/wrapper/version qualification scripts and a manual compatibility workflow | Available-Mac installed production game and 100-player mixed run passed; CI is prepared, not executed; other targets remain NOT RUN |

The distribution contains one npm tarball. Hosts provide supported Node `>=24.22.3 <25`; players still use browsers. Installation does not run build/download hooks. Bare `niche-out` opens local setup without preparing dependencies. **Start hosting** or `niche-out prepare` verifies/downloads pinned cloudflared into the user's cache. Preparing alone creates no public endpoint. Games remain in memory and the existing host/game controls, 100-player cap, scoring and protocol 2 remain unchanged.

The compiled layout intentionally keeps `apps/server/dist/hosting/launch.js`, `apps/server/dist/game/import-worker.js`, `apps/web/dist` and `apps/server/hosting-assets/local`; this preserves server asset resolution. Native resources live under `native/<tuple>`. Cache data lives outside the package. Installed resources can be read-only.

## Files to review

- [CLI](../../../bin/niche-out.cjs) and [runtime/ownership preflight](../../../bin/runtime.cjs).
- [Launcher](../../../apps/server/src/hosting/launch.ts), [preparation lifecycle](../../../apps/server/src/hosting/preparation.ts), [controller](../../../apps/server/src/hosting/controller.ts) and [local dashboard](../../../apps/server/hosting-assets/local/dashboard.js).
- [Connector cache](../../../apps/server/src/hosting/connector-cache.ts), [connector factory](../../../apps/server/src/hosting/connector.ts) and [resource verifier](../../../apps/server/src/hosting/resources.ts).
- [Native builder](../../../scripts/build-platform.mjs), [native inventory](../../../scripts/build-native-inventory.mjs) and [all-target rebuild recipe](../../../scripts/npm/rebuild-native.mjs).
- [npm assembly](../../../scripts/npm/assemble.mjs), [install check](../../../scripts/npm/check-install.mjs), [native check](../../../scripts/npm/check-native.mjs), [browser smoke](../../../scripts/npm/smoke.mjs) and [wrapper ownership check](../../../scripts/npm/check-wrapper.mjs).
- [Manual compatibility workflow](../../../.github/workflows/npm-compatibility.yml). It has no publishing, signing or public tunnel action. Its Windows Server runner would not certify physical Windows 11 behavior.
- [Operator instructions](../../release/OPERATOR-GUIDE.md), [contributor commands](../../DEVELOPMENT.md#build-and-check-the-npm-candidate), [release notes](../../release/RELEASE-NOTES.md) and [remaining authenticity work](../../release/SIGNING.md).

## Automated and installed-package results

Machine: Apple M3 Pro, 11 cores, 18 GiB RAM, Darwin 25.5.0. Node v24.22.3; npm 11.19.1. This does not qualify an 8 GiB host. The owner confirmed eduroam for the public installed-package capacity run.

The compact [evidence JSON](epic5-npm/summary.json) records exact artifacts, commands, results and remaining conditions. Detailed scratch logs are under `work/npm-migration/` and are not distribution files. The tested tarball is built locally under `dist-npm/`; nothing is published.

Final local artifact: `dist-npm/niche-out-0.1.0.tgz`, **428,802 bytes compressed** (excluding npm-installed production dependencies and the separately acquired connector). Its SHA-256 is `032ca9267f28c46068af397b4322eeaf638360dfdce750300a7c71bc4f1790b3`; the [candidate inventory](epic5-npm/candidate.json) includes npm integrity and native hashes. The production shrinkwrap contains 99 dependency paths. The [build manifest](epic5-npm/build-manifest.json) binds source/lock metadata to the candidate's resource-manifest digest.

| Check | Result and scope |
| --- | --- |
| Typecheck/build | Passed for the application and package assembly |
| Application regression suite | 485 tests across 37 files passed |
| Standalone npm/load harness checks | 27 passed with normal OS process inspection |
| Connector/cache fixtures | Passed, including independent-process acquisition, TLS CONNECT proxy with explicitly trusted CA, rejected insecure TLS, corrupt/interrupted downloads, cancellation, stale locks, hostile archives and version/digest coexistence |
| Clean tarball installs | Local, user-prefix global and npm-exec passed with `--ignore-scripts`, isolated npm cache, spaces/Unicode and unrelated CWD; actual bundled worker ran without workspace dependencies |
| Immutable package | Installed package made POSIX read-only; native check and subsequent 100-player hosting run passed |
| Cold/warm preparation | Fresh private cache downloaded and verified the pinned vendor executable; a second process reused and reverified it with an unreachable download proxy, without downloading |
| Installed browser game | Fresh Chrome at 390×844: two players, rejection/retry, explicit aliases, two rounds, joint winners at 200, refresh identity, browser-close survival, owner recovery and explicit quit passed |
| Actual npm-wrapper termination | While a real Quick Tunnel was active, killing only the npm wrapper removed the CLI, guard and connector and closed both listeners |
| Direct installed CLI termination | Setup-only SIGINT, SIGHUP and SIGKILL passed; active-hosting SIGKILL also removed the CLI/guard/connector and closed both listeners. These are programmatic signals, not physical terminal closure |
| Stopped-host version changes | Actual isolated global-prefix install `0.1.0 → 0.1.1-test → 0.1.0` passed; CLI/resource versions agreed, each process/listener stopped before replacement and shared verified cache bytes were preserved. No public game was started by this sequence |
| Available-Mac native execution | Exact tuple selection, continuous clock, process ownership and importing installed server entry passed |
| Other CPU/OS targets/current Node patch | Four payloads assembled; actual execution beyond the available Mac/Node tuple NOT RUN. Manual CI matrix is delivered, not executed |

The successful browser and active-wrapper checks used an earlier local repack of the same provisional version; capacity, preparation, version and direct-signal checks used the next measured repack. All **25 runtime/dependency/native resource files** (server bundle, worker, CLI, runtime helper, web/setup assets, native bytes, connector catalogue and shrinkwrap) are byte-identical to the final documentation/metadata repack, as recorded in [runtime equivalence](epic5-npm/runtime-equivalence.json). Fresh local/global/npm-exec installs and native checks ran again on the final tarball. Public/browser/capacity jobs were not repeated for documentation-only changes. Same-version repacks are not upgrade/rollback evidence; the distinct-version sequence above supplies that separate check. Changed runtime bytes would require affected checks again.

## Installed-package capacity result

One serial 100-player, 20-round game ran through the installed package's real managed Quick Tunnel, native helper and connector cache. The generator used 80 WebSocket players and 20 forced-polling players. Every client fetched production JS/CSS, the 101st admission was rejected, all admitted players reconnected while full, invalid answers were rejected, expected authored scores were checked, and duplicate request replay remained idempotent. **PASS; no failed workload assertion.**

- Endpoint readiness took 81.3 seconds; total workload took 152.6 seconds. Most game rounds are deliberately accelerated by the synthetic harness; this is not a real-duration endurance test or the Singapore pack.
- Server accepted-answer handler p95 was **3.43 ms**. This measures handler entry to acknowledgement enqueue; it excludes network transit and event-loop queueing.
- Accepted-answer end-to-end p95 was **262 ms for WebSocket** and **1,137 ms for polling**. These are measured network outcomes, not game-time extensions.
- Peak sampled application RSS was **293.7 MiB**, excluding client generator, native guard and connector. Connector CPU/RSS sampling is unavailable in the installed-launcher seam; no connector resource claim is made.
- All 507 separately tracked asset/probe HTTP requests returned 200. That HTTP counter is not a complete count of Socket.IO polling requests or provider in-flight requests.
- One polling request encountered `ENOTFOUND` during round 20. It recovered in **1.89 seconds**, all score checks completed, and no failure was hidden or rerun away. This is an observed DNS resolution failure; the report does not prove which upstream resolver/provider caused it.

This validates this installed mixed workload on the named machine/uplink. It does not close all-polling reliability, 100 physical phones, venue suitability, an 8 GiB host or all-platform certification. Existing README network limitations and earlier Epic 6 evidence remain in force.

## Failures encountered and what changed

1. **Dependency resolution during assembly could select newer transitive patches.** Assembly now seeds the production shrinkwrap from the reviewed workspace lock, prunes unused packages and rejects version drift. The host installs the exact reviewed external graph.
2. **Bundling changes the worker's module location.** The npm launcher now injects the separately packaged worker URL explicitly, retaining the source-layout behavior for contributors. Actual installed worker import and gameplay are checked.
3. **An early browser test bridge inherited `--input-type=module` into worker threads.** This caused `ERR_INPUT_TYPE_NOT_ALLOWED` and a visible import-capacity error in that harness. The bridge now uses ordinary Node evaluation without that inherited flag. It was a test harness fault, not evidence that the example exceeded the 10 MiB limit. Earlier failed reports remain in scratch evidence.
4. **An install-test helper initially omitted its new filesystem imports.** The read-only helper imports were corrected and its actual install/native runs repeated successfully.
5. **Sandboxed process inspection prevented one wrapper fixture from starting.** Running that check with normal `ps` access passed; the real active npm-wrapper termination check also passed. No ownership bypass was added.
6. **Package help documents linked to source documents absent from the tarball.** Assembly preserves shipped local links and rewrites source-only links to the repository, then checks staged links and packed inventory.

## Remaining handoff and release gates

- Run the prepared matrix and the actual Intel Mac, Windows 11 x64 and Ubuntu 24.04 x64 checks. Include native clocks, connector acquisition, browsers, Windows Command Prompt/PowerShell shims, Job Objects, process-tree cleanup and permissions. A Windows Server CI result is supplemental.
- Execute the minimum/current supported Node/npm matrix on real installed artifacts. Only the pinned tuple was executed here; other version decisions are unit-tested inputs.
- Physical terminal closure, real sleep/wake, system clock adjustment and clean-target quarantine/reputation checks remain scoped manual acceptance work. Programmatic installed CLI signal/kill checks passed on Mac; they do not replace the physical or other-platform cases.
- Repeat relevant physical iPhone/Android and accessibility/browser tests on final release bytes. Today's 390px Chrome evidence is viewport emulation; it does not establish mobile keyboard or screen-reader certification.
- Epic 6 must migrate the archive-oriented `release-plan`/`release-audit` publisher tooling, finish notices/source provenance and native authentication, qualify the final signed bytes, then separately obtain authorization to publish. The local candidate uses private unsigned native payloads.
- Registry package name/ownership, publisher identity/credentials and native signing/notarization inputs remain owner/release inputs. No package was reserved or uploaded.

Stop hosting and quit before changing npm versions. Installed files and in-use cache entries are immutable by application contract; external npm update/uninstall during a game is unsupported and cannot be prevented reliably by the CLI. No game state survives process restart.
