# Epic 1 handoff

Current application implementation and testing instructions: [managed hosting handoff](EPIC-1-MANAGED.md). Earlier evidence and scope-decision notes below are retained as dated history.

> **Later scope decision, November 14, 2026:** [Managed session hosting](../../TUNNEL-MIGRATION.md) moves the common launcher and temporary-tunnel lifecycle into planned E1-S15–S20. A named endpoint/account/domain is no longer mandatory. Required S13 transport checks feed S20; actual venue/provider capacity qualification remains E6. This dated evidence records the implementation tested before that expansion; use the [master tracker](../../IMPLEMENTATION-PLAN.md) for current scope and dependencies.

**Original LAN G1 completed on November 13, 2026.** The four workspace packages build from the pinned toolchain. The executable pack, command, acknowledgement, discovery and view contracts, deterministic fixtures and four feasibility investigations are available for implementation. The November 14 tunnel migration adds E1-S11–S14. These historical results establish the original LAN foundation. For current public-tunnel results and manual commands, use the [tunnel handoff](EPIC-1-TUNNEL.md); it distinguishes passing desktop evidence from remaining physical-device/transport/venue checks. Physical-device or distribution evidence is required at its owning later gate.

## Evidence

| Stories | Result |
| --- | --- |
| [S01 workspace](E1-S01.md) | Fresh install, typecheck, four workspace builds and an identical source digest in an independent source-only copy. |
| [S02 pack](E1-S02.md), [S03 text](E1-S03.md), [S06 fixtures](E1-S06.md) | Example/PRD parity, strict validation, Unicode comparison keys, controlled IDs/time and private fixture markers. |
| [S04 protocol](E1-S04.md), [S05 views](E1-S05.md) | Nine HTTP routes, eight socket commands and eleven permitted role/phase views. The combined pack, protocol and harness suite passed all 91 tests. |
| [S07 LAN](E1-S07.md), [S08 tabs](E1-S08.md) | Real desktop Chrome on a selected private origin passed polling, upgrade, copied-proof race, reload, explicit takeover and same-ID reply recovery. |
| [S09 import](E1-S09.md) | Nine worker scenarios passed. A 7,660,865-byte / 36,000-answer pack took 110 ms and peaked at 139.70 MiB resident memory in the recorded M3 Pro run. |
| [S10 platform](E1-S10.md) | The Mac awake clock probe and four power-helper cleanup paths passed. All four release targets have lifecycle, signing and evidence owners. |

## Checks on your equipment

**Timing.** The following instructions exercise the historical LAN probes. New tunnel validation will use E1-S13. These checks can be done before the production networking and launcher stories. Deterministic game-core development can start immediately. The browser fixtures use synthetic data. No session or uploaded pack is required.

**Setup on this Mac.** Open Terminal and use the existing development runtime.

```sh
cd ~/Projects/niche_out
export PATH="/Users/kianhong/Documents/Codex/2026-11-12/in-this-project-directory-i-want/work/node-v24.22.3-darwin-arm64/bin:$PATH"
node -v
```

Expected runtime is `v24.22.3`.

1. **Phone on the host's Wi-Fi.** Find the phone's Wi-Fi IPv4 address in its network settings. In `npm run probe:lan -- --peer=192.168.1.42`, replace the example with that address. Open the printed address on the specified phone in Safari or Chrome. A successful round trip displays **polling → websocket → ok**. Record phone OS/browser, Wi-Fi type, and whether the page loaded or stalled before the upgrade. Ctrl-C stops the probe; it also expires after five minutes. If multiple local adapters are offered, set `PROBE_LAN_IP` to the host's Wi-Fi IPv4 address. The manual mode admits just the host and the specified device. Same-host testing cannot establish whether the router allows peer traffic.
2. **Native Duplicate Tab.** Run `npm run probe:tabs -- --manual` and open the printed URL in a fresh browser profile or private window on the host. Type a temporary draft and reload. The input should clear and the displayed control generation should advance once. Duplicate the controlling tab using the browser's actual menu. Use **Check current control** on the old and new tabs; only one should confirm current control. Duplicate the stale tab as well. A browser that copied the stale record should show **CONTROL_CONFIRMATION_REQUIRED**. Click **Take control here**, then recheck the older page for **TAB_SUPERSEDED**. Record browser/version, action and observed generations, especially if the browser restored a draft or treated a duplicate as fresh. Try the browser you expect to host with first. Ctrl-C ends the fixture.
3. **Mac sleep/wake.** With Command Line Tools available, run `npm run probe:platform -- --watch`. Press Enter, deliberately sleep the machine for about 30 seconds when convenient, wake it and press Enter again. Record the two lines immediately before and after sleep and the approximate sleep duration. The first column is elapsed continuous milliseconds and should include sleep. The second is awake elapsed time. Ctrl-D exits. This checks the hardware clock; one-phase game recovery is an E5 integration test.

## Later validation

| Owner | Inputs and expected evidence |
| --- | --- |
| E3-S04/S08/S12/S13 | Actual server registration/transport reconnect, cache/fence ordering, compiled pack transfer and redacted serialization. Repeat network checks on the production listener. |
| E5-S02–S10 | Real macOS arm64 and Intel x64, Windows 11 x64, Ubuntu 24.04+ x64. Verify clock/suspend behavior, closure of the actual package launcher, offline startup, sleep request release and address change. |
| E6-S02–S05 | Modern 8 GiB reference laptop, 100 simulated players plus host, real router and mixed phones. Record versions and workload, measure latency/memory. Complete the iOS/Android and desktop browser/accessibility matrix. |
| E6-S06–S12 | Publishing identity, licenses/notices, signing infrastructure and clean signed-package tests. Public distribution requires the separately authorized release step. |

The remaining Epic 1 task is **E1-S13** validation. S11/S12 now satisfy the contract gate for authorized **E2-S01**, which compiles per-prompt canonical answer/alias indexes from the parsed pack and reproducible matching keys. E3 remains gated on S13. [Master tracker](../../IMPLEMENTATION-PLAN.md)
