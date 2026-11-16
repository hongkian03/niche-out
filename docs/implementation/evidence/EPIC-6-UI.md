# Epic 6 responsive UI and accessibility investigation

November 16, 2026. This report covers the available Mac/Chrome investigation for E6-S04 and E6-S05, including fixes and reproducible evidence. It does **not** certify every supported browser/device, assistive technology, or full WCAG conformance. The owner deferred other-platform testing until after Epic 6.

## Environment and method

- Host: macOS 26.5.2, Apple Silicon; pinned Node 24.22.3 / npm 11.19.1; installed Chrome 157.0.8103.51.
- Each harness launches a fresh Chrome process and isolated contexts. It does not reuse the owner's browser profile, cookies, tabs, or game.
- Layout renders the actual React application/components against contract-validated synthetic views. There are 26 named states, including host setup/lobby/live/results/final, player join/full/lobby/read/answer/results/final, removed/closed/superseded/reconnecting/error, role conflict, and invalid import.
- Synthetic stress content includes a 256-character title, 4,096-character prompt, 512-character answer, 128-character tier, 32-character nickname, maximum safe integer scores, and a 100-player roster. The fixtures deliberately hold their countdowns at 600 seconds so layout checks can finish; this does not change the game's 3/25/10-second default configuration.
- Axe is an isolated **axe-core 4.11.0** development tool under `tooling/accessibility`; neither project dependencies nor package-lock were changed. Audit tags include WCAG 2.0/2.1 A/AA, WCAG 2.2 AA, and best-practice rules. The launcher audit injects axe using an audit-only CSP bypass; application CSP is unchanged.
- The local launcher uses its real controller, HTML, CSS, and JavaScript with a simulated hosting manager. These checks establish UI behavior, not the tunnel provider's availability. Production server/tunnel/load evidence belongs in the other Epic 6 reports.

## Test inventory and results

| Check | Scope | Result |
| --- | --- | --- |
| Responsive layout | 26 states × 320, 360, 390, 412, 768, 1280, 1920 px widths and 844×390 landscape; plus five 640×450 reflow cases | 213 cases pass, no document-level horizontal overflow or timer-ring text overflow |
| Extreme personal reveal | 512-character answer, 128-character tier and maximum score at 320×740 | Bounded wording scroll, visible countdown and reachable tabs pass |
| Small-screen interactions | 390×440 short viewport; Submit reachable by deliberate scrolling; touch-emulated 390×844 context | Submit reachable; tap focuses input; opening Answering does not force touch input focus |
| Axe rendered-DOM audit | 26 states + Manage players + removal confirmation, each at 320×740, 390×844, 1280×900; four launcher states | 88 audit cases pass with zero reported violations after semantic fixes |
| Keyboard/focus | Desktop auto-focus; prompt scroll preservation; result tabs Arrow/Home/End; nested dialogs; Cancel; pending dismissal; removed-opener fallback | Pass |
| Answer interaction | Explicit Enter; modeled composition guard; pending duplicate suppression; rejection text/focus preserved; accepted blur | Pass; modeled composition is not real OS IME coverage |
| Reconnection display | Same-document draft preserved; input and Submit disabled while reconnecting | Pass |
| Reduced motion/assets | Scenery animations disabled under reduced motion; bundled font and local assets | Pass; no external fixture asset requests |
| Web regressions | `vitest run tests/web` | 107 tests across five files pass |
| Types | Workspace typecheck | Pass |
| Launcher confirmation regression | Real controller, stale empty-state response followed by authoritative state-loss confirmation | Pass |
| Declared CSS contrast | Five existing game ratios plus 11 supplementary game/launcher colour pairs | All checked pairs meet their applicable 4.5:1 text or 3:1 control threshold |

The final padding-only adjustment for the 320px Standings tab was followed by another full 213-case layout run and a production web build. The 88-case axe report covers the semantic and bounded-wording changes immediately before that padding adjustment; text, roles, colours, and minimum target height were unchanged by it.

The 640×450 cases approximate the layout viewport of a 1280-pixel window at 200% zoom. They are **not actual browser zoom or text-only zoom tests**. The phone contexts are Chrome viewport/touch emulation, not iOS Safari or Android certification.

## What went wrong and what changed

The first complete axe run checked 61 cases. Thirty-nine cases had 87 repeated rule occurrences across eight distinct rule categories; these were repeated views of shared component problems, not 87 independent defects. The baseline is retained in `work/accessibility/accessibility-before.json`.

1. **Host page landmarks and headings were inconsistent.** Setup/lobby lacked a main landmark; host toolbar/stage headers created duplicate banner landmarks; setup started with an h2. The host now has one main container across every phase, nested stage wrappers are ordinary divs, setup starts with an h1, and candidate/roster heading levels follow the document hierarchy. Existing type sizing is preserved.
2. **Live status messages used an invalid element/role combination.** Connection notices were `<aside role="status">`. They are now div live regions. The unused-answer block is ordinary related content rather than an incorrectly nested complementary landmark.
3. **Player reveal heading levels skipped a level and final standings duplicated a region name.** `AnswerGroups` accepts the appropriate heading level for its context; final standings now has a distinct accessible name.
4. **Generic element aria-labels did not provide reliable semantics.** The wordmark already has readable text, so its redundant aria-label was removed. Game codes retain visible leading zeroes and use a visually hidden digit-spaced phrase for accessible reading, instead of naming an otherwise generic paragraph. The invitation regression assertion was updated for that markup and both visible/accessible forms.
5. **The local launcher still said the playable game was unavailable.** Its sharing instructions now describe joining and opening the private host page to prepare a game. Readiness is a polite live heading updated only when its text changes, avoiding repeated live-region mutations from one-second state polling; QR/finish dialogs have associated names, destructive confirmation has its descriptive text associated, and the heading reflects Finish, Quit, or Start fresh appropriately. Cancel remains the initial focused action.
6. **Visual review found an extreme-answer usability problem missed by overflow checks.** A 512-character personal answer filled multiple phone screens and pushed the reveal timer/tabs far down the page. Personal accepted wording now has a bounded, labelled, keyboard-focusable manual-scroll area; points/countdown remain outside it. This preserves the full answer/tier/alias without tiny text or automatic scrolling. The 320×740 regression confirms keyboard scrolling, countdown visibility, and reachable tabs. Reduced tab padding also keeps “Standings” on one line at 320px without reducing font or target height.

The new audit harness itself needed two corrections during setup: it initially wrote HTTP headers before a possible missing-file read, and then assumed inline axe injection would bypass the launcher's CSP. The harness now reads before replying and explicitly uses an audit-only CSP-bypass context. Neither was an application defect; neither weakens production security.

## Visual inspection

Saved PNGs were opened and visually inspected, rather than relying only on DOM dimensions. Reviewed: 360px Join, 412px Answering, 844×390 landscape Answering after deliberate scrolling, 320px maximum-length results, 1280px maximum-title/100-player host lobby, 1920px host reveal, 390px nested removal confirmation, and 390px local launcher.

Normal phone views retain readable type, sufficiently large inputs/buttons, the Niche Out wordmark, visible timer/Submit, and a single-column layout. The nested removal dialog keeps both Cancel and Remove visible. Host presentation uses the wider two-column layout and long scores wrap without overlapping adjacent cells. Long titles intentionally wrap and can require page scrolling. The worst-case answer reveal issue above was identified by this visual review, even though the document had no horizontal overflow.

## Contrast review and limits

The existing measured game ratios are: ordinary panel text **15.05:1**, muted panel text **8.59:1**, primary button **15.14:1**, focus outline **10.72:1**, control border **3.69:1**.

Supplementary declared-colour checks cover muted/cyan/warning/error text on raised game surfaces (minimum **6.31:1**), timer text on its opaque centre (**15.05:1**), launcher text/eyebrow against its brightest gradient stop (minimum **6.01:1**), launcher control border (**4.46:1**), and primary button text (**9.89:1**). See `work/accessibility/contrast-review.json` for exact inputs and ratios.

Axe still records **incomplete colour-contrast evaluations** where it cannot resolve gradient backgrounds, timer pseudo-elements, decorative glyphs, clipped scroll content, or overlapping boxes. These are not silently counted as passes: palette calculations and PNG inspection supplement them, but a complete pixel/assistive-technology review remains outside this automated audit. Decorative glyphs are already hidden from assistive technology.

## Remaining work and non-essential limitations

- Physical iPhone/iOS Safari, Android/Chrome, and other desktop browser/OS runs remain manual follow-up. Earlier [Epic 4 physical iPhone/eduroam-to-cellular QR evidence](EPIC-4.md#physical-device-and-native-browser-checks) remains useful historical evidence, not a new Epic 6 run or certification of these changes.
- Actual VoiceOver/screen-reader speech, announcement timing, rotor navigation, real keyboard/OS IME, native pinch zoom, browser zoom, and text-only enlargement were not exercised. Semantic/keyboard/axe checks cannot substitute for them.
- A very long game title still takes substantial vertical space in the lobby; the 100-player roster, full standings, and long grouped answers require deliberate scrolling. This is permitted by the readable-wrap/manual-scroll design, though authoring concise titles and wording improves event presentation. No automatic scrolling or truncation was introduced.
- The protocol/network correctness of reconnection, copied tabs, and uncertain submissions is covered separately by production/client tests. Fixture status switching only verifies what those states render and whether editing is correctly disabled.
- No public WCAG conformance claim, universal mobile compatibility claim, or 100-physical-browser rendering/load claim follows from these results.

## Reproducing the checks

Use the pinned Node version from `.nvmrc`, install workspace dependencies as documented, and build the server/contracts before running the launcher audit:

```sh
npm run build
npm run typecheck
npm run test:web
npm run test:web:layout
npm install --prefix tooling/accessibility --no-save --package-lock=false axe-core@4.11.0
node scripts/test-accessibility.mjs
node scripts/test-local-dashboard.mjs
```

The installed Chrome channel is used by default. `PROBE_BROWSER_PATH` can select an explicit compatible browser executable. Harnesses own and clean up their test browsers/listeners.

## Changed files and evidence

Production UI: `apps/web/src/App.tsx`, `Host.tsx`, `Player.tsx`, `components.tsx`, `styles.css`; local launcher `apps/server/hosting-assets/local/index.html` and `dashboard.js`.

Validation: `probes/web/fixtures.tsx` (nine additional states), `scripts/test-web-layout.mjs` (expanded viewport/touch/long-result checks), new `scripts/test-accessibility.mjs`, and `tests/web/host.test.ts` (invitation regression adjusted for accessible code wording). There are no new runtime dependencies.

Generated local artifacts (ignored by source packaging):

- `work/web-ui/layout-report.json`, `layout-partial.json`, and viewport PNGs.
- `work/web-ui/fixture-player-results-long-320-before.png` retains the visual problem before the bounded result-wording fix; `fixture-bounded-long-result-320.png` shows the corrected narrow reveal with focused manual-scroll wording and reachable tabs.
- `work/accessibility/accessibility-before.json`, `accessibility-report.json`, `contrast-review.json`.
- `work/accessibility/phone-remove-dialog.png`, `phone-launcher-ready.png`, `phone-launcher-finish-confirmation.png`.

Final production UI assets from this work: `index-dnoctMNn.js` SHA-256 `d05b2b7dfb42658b14975c3c27ffabb96bdd85bfbc88387eba24c6511153ef3e`; `index-lb1N9Y27.css` SHA-256 `209206b3945ee221138addfb23334a4020d2bac5dc7fc87b4c929692afae7c19`. The complete source manifest also includes concurrent server/release work and must be regenerated by the coordinator.

The overall Epic 6 coordinator records the final rebuilt source identity and combines this UI evidence with capacity, recovery, import, and release evidence. This report alone does not mark the full E6-S04/E6-S05 external-device/assistive-technology gates complete.
