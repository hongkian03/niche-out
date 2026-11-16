# Native lifecycle boundary

These small C sources are compiled at development/build time, never at host startup. `node scripts/build-platform.mjs` builds the current target into `tooling/platform/<os>-<cpu>/` and installs developer copies in `tooling/`. The package builder copies target-specific outputs into the archive's `tooling/`. Node headers are required for building, not running.

`platform.c` is an N-API module loaded by `apps/server/src/hosting/platform/index.ts`. Every `now()` synchronously reads an OS monotonic clock that includes suspension: macOS `mach_continuous_time`, Linux `CLOCK_BOOTTIME`, Windows `GetTickCount64`. No wall-clock subtraction or delayed native sample decides answer eligibility. A 250 ms watchdog invokes the app's one-phase recovery callback after a gap over five seconds; direct requests still use the native clock before that callback fires.

Power requests only prevent automatic idle sleep. macOS uses an IOKit idle-system assertion, Windows a thread execution-state request, and Linux a logind idle inhibitor through `systemd-inhibit --what=idle`. Deliberate sleep remains possible. A failed/terminated inhibitor emits a local warning. Linux requires systemd/logind and permission for the idle inhibitor; failure never claims protection. `setActive(false)` and close release owned requests. macOS/Windows OS ownership releases power state after abrupt process exit; Linux's inhibitor command receives pipe EOF after the owner dies.

Windows initializes a non-inherited kill-on-close Job Object before creating application children. The handle deliberately stays open until process exit; closing it while Node runs would terminate the host itself. Job assignment failure stops startup. The Windows implementation and binaries are prepared but actual Windows execution is deferred to the user's platform testing.

On macOS/Linux, `guard.c` owns the connector's new process group. Node alone holds its stdin ownership pipe; EOF or a changed parent PID triggers SIGTERM, then bounded SIGKILL cleanup of the whole group. Normal connector exit also cleans descendants. FD 3 reports the actual connector PID, preserving diagnostic interruption tests. This does not defend against an intentionally escaping/untrusted descendant; only the pinned connector is launched. Abrupt host death can leave a harmless private temporary config directory containing `{}`; no tunnel credentials are stored there.

## Build options

- `--target=darwin-arm64|darwin-x64|linux-x64|win32-x64`
- `--headers=/path/to/include/node`
- `--out=/explicit/output` (does not install developer copies)
- `--cc=/path/to/compiler`
- `--cc-args='["cc","-target","x86_64-linux-gnu"]'` for Zig cross builds
- `--node-lib=/path/to/node.lib` for Windows

Mac uses clang and IOKit/CoreFoundation; Linux uses libc; Windows uses Kernel32 and the pinned Node import library. The small native module uses the stable N-API interface, while application runtime version remains pinned separately.

## Evidence boundaries

Available Mac checks: native elapsed time, actual pmset idle assertion acquisition/release, POSIX process-group cleanup after graceful ownership EOF and forced Node-parent SIGKILL. Injected-clock tests cover wall-clock independence, immediate synchronous sleep-gap visibility before watchdog, one callback per gap, failed power requests and failed process ownership. Physical sleep/wake, wall-clock-setting changes, and native Windows/Linux/Intel execution are not claimed by these tests. No test automatically sleeps the user's machine or changes its clock.

References: [Apple continuous clock](https://developer.apple.com/documentation/kernel/1646199-mach_continuous_time), [Windows tick count](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-gettickcount64), [Windows job ownership](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects), [systemd idle inhibition](https://www.freedesktop.org/software/systemd/man/latest/systemd-inhibit.html).
