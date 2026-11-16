# Epic 4 browser game handoff

Implemented November 14 and verified through November 15, 2026 in `~/Projects/niche_out`. The user authorized all Epic 4 stories with parallel contributors and a coordinator. Contributors owned the connection client, host screens and player screens. The coordinator owned shared visuals/components, App routing, production asset serving, integration, real-tunnel checks and documentation. The [master backlog](../../IMPLEMENTATION-PLAN.md#story-tracker) remains the only mutable story-status source.

The built app now supplies a playable host/player experience using the existing production engine and protocol. The user confirmed successful iPhone QR joining, gameplay and usability checks on November 15. All 12 Epic 4 stories and functional gate **G4 are complete**. Broader platform, capacity, venue and device/accessibility qualification remain with Epics 5 and 6.

## Delivery and evidence

| Story | Implementation and verification |
| --- | --- |
| E4-S01 | Original SVG ocean/submarine, local VT323 and OFL notice, opaque stepped panels, responsive typography, labelled controls and dialogs. Fixture browser checks cover keyboard containment/restoration, long strings, contrast, reduced motion and layout. |
| E4-S02 | Schema-validated discovery/complete views, instance/game/revision/control fences, monotonic-clock alignment, three initial clock samples and 30-second resampling. Same-ID retries, host-operation persistence/resolution and phase-safe answer recovery have injected-transport tests. |
| E4-S03 | Picker/drop import, field errors, effective title/tier/timer review, explicit Create/Replace, candidate expiry, Back and preserved previous state. Real browser tests drop all three commit replies after server execution and observe successful reconciliation without duplicate creation. |
| E4-S04 | Public code-prefilled invitation, local QR generation/enlargement, copy/manual fallback, discovery before nickname/code fields, explicit admission and role-conflict recovery. Real Chrome admission and fallback checks pass; phone QR evidence is recorded separately below. |
| E4-S05 | Stable-ID roster, nickname search, disconnected indicators, admitted count, one-click Start, and removal confirmation initially focused on Cancel. Real server/browser removal and replacement-cancellation checks pass. |
| E4-S06 | Stable prompt/composer, server-deadline countdown/ring/bar, readiness and desktop-only automatic focus. Browser fixtures verify reading-to-answering focus/scroll, Enter and modeled composition guards. A short viewport allows manual scrolling to Submit. Physical keyboard evidence is separate. |
| E4-S07 | Pending/confirming answer feedback, neutral locked text, accepted blur, retryable rejection, local-zero synchronization and no automatic submission. Actual browser outage preserves/freezes the draft; reconnect restores it; refresh clears it. |
| E4-S08 | Own canonical/tier/points, alias wording, anonymous grouped counts, unused example and shared standings. Keyboard-accessible Answers/Standings tabs preserve selection within a phase and reset for a new round. Zero/miss/all-used/long-value fixtures pass. |
| E4-S09 | Joint winners, full standings, own personal recap and host aggregate-only recap. Round details load on demand. The actual game ends with two players tied at 200; invalid replacement preserves results and committed replacement clears them. |
| E4-S10 | Large shared prompt/countdown/readiness, two-column host results and Manage players overlay. Real play continues through an open management dialog. Fixture checks include 1920×1080 presentation, 100-player roster, pending removal dismissal and phase-change focus fallback. |
| E4-S11 | Explicit tab takeover, copied continuation, stale/outage/removed/replaced/owner-conflict states, frozen uncertain controls and recap scope. Actual connector suspension/resumption preserves the public origin and finished game. Native duplication and physical Safari evidence are recorded separately. |
| E4-S12 | The actual built app and production server complete upload, invitation, admission, retry/lock, timed reveal, recaps and replacement through a real temporary tunnel. The user-confirmed cellular phone QR/gameplay demonstration and the independent runner both passed. Formal venue/load/device/release claims remain later gates. |

## Implementation map

- [Browser integration guide](../../../apps/web/README.md): store, routing, host/player components, shared visuals and test boundaries.
- `apps/server/src/game/application.ts`: exact named public examples/notices and hashed font/art asset types; authenticated removal reporting before retired-page authorization.
- `tests/web/client.test.ts`, `host.test.ts`, `player.test.ts`, `components.test.ts`, `app.test.ts`: 107 additional unit/component tests.
- `tests/server/application.test.ts`: actual remove/disconnect/snapshot/reconnect regression and public example/license MIME checks.
- `probes/web` and `scripts/test-web-layout.mjs`: separate fixture build and real Chrome layout/interaction harness.
- `scripts/test-browser-game.mjs`: actual production UI/tunnel integration and guided phone run. No diagnostic app routes or alternate scoring are used.
- `scripts/test-game-server.mjs`: the older protocol harness now waits for the full host shell after authorization instead of the removed placeholder text.

## Automated results

Environment: pinned Node **24.22.3**, npm **11.19.1**, available macOS arm64 host, Chrome **157.0.8103.51**, pinned cloudflared **2026.11.0**. No permanent domain or provider account was needed. There is no Git metadata; `build/manifest.json` records a content-derived source digest.

- Full workspace typecheck and all four production builds pass.
- **406 tests across 28 files pass**: the prior 298 tests, 107 browser tests, and one server removal regression.
- The asset scan passes across **15 built/served files**, including the font, example and notices. Private pack/view fixtures are absent.
- `node scripts/test-web-layout.mjs` passes **90 viewport/reflow cases** at 320, 390, 768, 1280 and 1920 CSS-pixel widths, plus a 200%-equivalent reduced viewport. This is not a claim about a physical phone keyboard or actual browser zoom.
- Actual opaque-panel contrast: primary text **15.05:1**, muted text **8.59:1**, primary button **15.14:1**, focus **10.72:1**, border **3.69:1**. The broader accessibility/assistive-technology matrix remains E6-S05.
- Chrome fixture interactions cover nested modal focus, pending dismissal, removed-opener fallback, local asset loading, reduced motion, desktop phase-opening focus, prompt-scroll preservation, explicit Enter, modeled IME suppression, duplicate-pending prevention, rejected text/focus, accepted blur, and result-tab navigation/preservation/reset.
- The actual complete browser run passed at `https://lodging-arcade-inclusion-matches.trycloudflare.com`: import, dropped commit replies, copy fallback, roster/removal, canceled replacement, rejection/Enter, hidden pre-reveal tiers, draft outage/reload, two-round joint winners, private/aggregate recaps, copied continuation/takeover, owner/player conflict, real connector interruption, and final replacement. That automatic session cleaned up its browser, server and connector.
- Test reports/screenshots are under `work/web-ui/`: `browser-result.json`, `layout-report.json`, and representative host/player screenshots. They are generated artifacts, not runtime assets or permanent hosted links.

## Physical device and native browser checks

The successful physical-phone session used `https://david-cord-concerning-classifieds.trycloudflare.com`, code `469862`. The Mac was on **eduroam** and the iPhone used **cellular with Wi-Fi off**, following the test instructions. On November 15 the user confirmed all requested cases worked, then explicitly confirmed **scanning the QR code**. The confirmed checks were public invitation/admission, Banana rejection followed by Fall acceptance, keyboard dismissal, timer/Submit reachability with the keyboard open, Safari background/return, Amber acceptance, joint winners on 200, and working final recap details. The runner independently recorded PASS for the two-player tie and personal/aggregate recaps in `work/web-ui/manual-browser-result.json`. These results cover the available device and network, not every Safari version or eduroam deployment.

After confirmation, the coordinator sent SIGINT to the owned test runner. Its normal cleanup closed the temporary browser, game server and connector; a process check confirmed both runner and connector had exited. The public test URL is now expired. No gameplay code changed during evidence closeout, so the already-passing suites were not rerun for documentation-only updates.

Earlier attempts are retained for context: the November 14 session at `https://willing-lindsay-edges-solar.trycloudflare.com` timed out before phone admission and supplied only the native-tab evidence below. The November 15 session at `https://recommend-ace-race-receptor.trycloudflare.com` reached round 1 but the manual runner was still looking for a lobby-only roster after the host started. The runner was fixed to inspect the full admitted count or an already-started phase and to accept arbitrary nickname capitalization. A separate `--manual-smoke` regression through a real tunnel reproduced an early Start with lowercase `phone` and passed both rounds before the successful physical-phone rerun. These interrupted attempts were not counted as phone passes.

The coordinator used Chrome’s actual tab context-menu **Duplicate** action on the Auto player while the guided session was in Lobby. The original displayed **This game is active in another tab**. Clicking **Take control here** restored the original; the duplicate then displayed the supersession message. The duplicate was closed and the original retained the Auto identity and lobby membership. The host invitation window was restored for the phone check. This is native-menu evidence, in addition to the automated copied-continuation test.

## Defects found and resolved

- A removed player's page had been retired before the inspection path checked removed membership, incorrectly producing UNAUTHORIZED. The production listener now preserves distinct REMOVED results for authenticated removed identities while retaining UNAUTHORIZED for unrelated credentials.
- Reconnect inspection allocated and discarded a new page; it now inspects the existing page without exhausting registration metadata.
- Losing owner cookies now retains a disabled host view with local-launcher recovery instructions; routing tests distinguish this from a closed player session.
- Late answers/import summaries and old host-operation verdicts could affect a later round/game. Context checks and regression tests now discard or reconcile those outcomes.
- Browser epoch time and server monotonic time differ. The first authorized view anchors the offset before rendering; lowest-RTT samples refine it without broadcast drift.
- Long unbroken titles/tier names overflowed narrow views. They now wrap; large minute countdowns have enough space and retain their ring size through the minute boundary.
- Native dialog Tab navigation could enter browser chrome; explicit first/last wrapping now contains it. A disabled/removed opener falls back to the remaining modal heading or current phase heading.
- The manual runner could wait on a removed lobby element after a human pressed Start. It now tolerates that transition and nonexact nickname spelling; the actual-tunnel regression and repeated phone run passed.
- A test-only recap selector matched a hidden second recap row. It was narrowed to the expanded row; the game itself had already finished correctly.

## Reproduce and remaining scope

```sh
cd ~/Projects/niche_out
npm run typecheck
npm run build
npm test
npm run test:web:layout
npm run test:web:tunnel
npm run probe:web
```

Use `npm run host` for ordinary play: Start hosting in local setup, Open host page, upload/review/Create lobby, share the lobby QR/link, then Start game. `probe:web` is a disposable guided test with a 600-second answer timer; it does not change normal JSON defaults. Ctrl-C cleans up the test session. Closing an ordinary game browser leaves its launcher/server running.

Epic 5 owns self-contained portable packages and platform lifecycle behavior. Epic 6 owns measured 100-player throughput, the broader browser/device/assistive-technology matrix, venue/provider qualification, signing and release. Those claims do not follow from a 100-row visual fixture or a successful two-device game.

G4 is complete. The next eligible story is **E5-S01**, awaiting user authorization.
