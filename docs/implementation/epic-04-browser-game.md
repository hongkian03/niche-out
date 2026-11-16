# Epic 4 Complete browser game

Tunnel baseline updated November 14, 2026. Current story status is maintained only in the [master backlog](../IMPLEMENTATION-PLAN.md#story-tracker); these cards define scope and evidence rather than claiming completion.

## Outcome

Integrate the E1 hosting dashboard and private host handoff with real pack/lobby/game screens. E1 QR/link sharing initially reaches a connection fixture; this epic wires the current game code, nickname admission and complete player experience. Keep local hosting controls separate from public in-game Start/Remove controls.

Deliver the agreed host and player browser experience over the proven server, including a demonstrable full game and recovery paths.

## Entry and required reading

G3 is complete. Use production endpoints and fixture snapshots; do not create a parallel frontend scoring, timer, validator, or room model.

- [UI and interaction baseline](../UI-UX.md)
- [Complete views](../ARCHITECTURE.md#snapshot-and-information-boundaries)
- [Host recovery interaction](../UI-UX.md#host-operation-recovery)

## Story dependencies

All stories inherit the previous epic's gate in the default linear path.

| Story | Size | Direct prerequisites |
| --- | --- | --- |
| E4-S01 | 2 | E3-S13, E1-S05 |
| E4-S02 | 2 | E3-S13, E1-S05 |
| E4-S03 | 2 | E4-S01, E4-S02 |
| E4-S04 | 2 | E4-S03 |
| E4-S05 | 2 | E4-S04 |
| E4-S06 | 2 | E4-S05 |
| E4-S07 | 2 | E4-S06 |
| E4-S08 | 2 | E4-S07 |
| E4-S09 | 2 | E4-S08 |
| E4-S10 | 2 | E4-S05, E4-S08, E4-S09 |
| E4-S11 | 2 | E4-S09, E4-S10 |
| E4-S12 | 2 | E4-S11 |

## E4 S01 Local visual and component foundation

**Outcome:** New screens share the accepted original visual system and accessible control behavior.

**Size:** 2. **Depends on:** E3-S13, E1-S05.

**Planned areas:** apps/web tokens, local fonts/assets, layout, fields, buttons, and reusable overlays.

### Work

- Implement palette/type/spacing/stepped frames, original provisional ocean/submarine art, and local font fallback/notices.
- Build reusable labelled fields/buttons/statuses and a dialog primitive with focus containment/restoration and phase-heading fallback.
- Provide long-text, zoom, reduced-motion, and pending/disabled fixtures without introducing new settings.

### Acceptance

1. No font/art/script requires a public CDN and reference screenshots are not runtime assets.
2. Targets/focus/contrast remain readable with wrapping and a 320 px viewport.
3. Closing a dialog never claims to cancel an already-sent mutation.
4. Imported strings render as text and cannot execute HTML, scripts, or styles.

**Verification:** Component-level keyboard/focus/layout checks and representative screenshots; validate composited contrast as implemented.

## E4 S02 Authoritative browser connection client

**Outcome:** Screens consume complete server views and have one place for discovery, retry, and reconciliation.

**Size:** 2. **Depends on:** E3-S13, E1-S05.

**Planned areas:** apps/web connection/session store and operation coordinator.

### Work

- Handle gateway HTML, quota errors and connector disconnect as transport uncertainty with bounded backoff.

- Implement discovery before form/resume, current-view revision/instance/game handling, clock sampling, and pending command tracking.
- Persist only tab/control metadata and required operation identity, never unsent answer text.
- Implement two same-ID retries, host atomic resolution, reconnect freeze, and phase-safe handling of late replies.

### Acceptance

1. Old views/replies cannot overwrite a later phase/game or enable a superseded controller.
2. A missing host reply remains Confirming game until a valid resolved outcome exists.
3. Refreshing clears drafts, while accepted answers and current membership come from server state.

4. Same-origin recovery preserves state and a changed public origin directs fresh admission.

**Verification:** Include provider error bodies and interrupted discovery.  Connection-store tests with ordered/unordered snapshots, dropped replies, instance changes, expired sessions, and stale continuation proof.

## E4 S03 Host upload summary and explicit commit

**Outcome:** A host reviews the file and intentionally creates/replaces a lobby.

**Size:** 2. **Depends on:** E4-S01, E4-S02.

**Planned areas:** Host setup, upload error/summary, replacement, and commit screens.

### Work

- Show Connecting, Ready, Reconnecting and failed hosting status alongside pack review.

- Add file picker/drop target, sample/format help, checking state, field errors, and effective settings/tier summary.
- Implement Create lobby/Replace game, replacement warning, Back without commit, expired-candidate recovery, and pending-safe controls.
- Show role-conflicting owner recovery instructions and preserve confirmed state after a rejected file/commit.

### Acceptance

1. A preview alone never creates a lobby and invalid files never erase the current game.
2. A timed-out commit does not show false failure or offer an uncontrolled second creation.
3. Future prompts/accepted answers stay out of the summary and presentation surface.

4. The public invitation is promoted only after verified readiness.

**Verification:** Test readiness and upload/commit uncertainty together.  UI/server scenarios for good/invalid/overlong/expired files, failed replacement, lost commit, and owner/player conflict.

## E4 S04 Public invitations and player admission

**Outcome:** Players can reach and enter the correct public lobby without accounts.

**Size:** 2. **Depends on:** E4-S03.

**Planned areas:** Host QR/link controls and player join form/discovery state.

### Work

- Generate links only from the configured public HTTPS origin and explain that internet access is required on Wi-Fi or mobile data.

- Generate the public invitation QR locally, enlarged QR dialog, Copy join link and manual-copy fallback.
- Build six-digit text code entry with numeric keyboard/paste support, fixed nickname entry, and all admission error states.
- Skip the form only after admitted membership is verified; preserve nickname input on recoverable errors and prevent duplicate joins.

### Acceptance

1. Leading zeroes survive and direct links prefill the code without exposing owner credentials.
2. No public game-code lookup or QR service is used.
3. Started/full/ended/removed/history-limit/no-lobby cases have correct distinct outcomes, and a stale invitation never autojoins a replacement.

4. A phone on cellular reaches the configured URL and no owner secret is in the QR/link.

**Verification:** Test actual off-network scan and malformed or expired origin feedback.  Production-browser QR URL/prefill/copy fallback/admission tests plus a real scan on an available phone; record missing device evidence for E6.

## E4 S05 Lobby roster and host controls

**Outcome:** The host can assemble and start the room while players clearly see their admission.

**Size:** 2. **Depends on:** E4-S04.

**Planned areas:** Host/player lobbies, nickname search, Start, and removal confirmation.

### Work

- Disable Start until the tunnel readiness contract reports ready.

- Show game/title/count/connection states, fixed player identity, and waiting state without Ready.
- Add stable admission-order roster, search/match count, zero-match state, and per-player confirmation bound to its ID.
- Implement one-click Start with entry-closing copy and pending/uncertain handling.

### Acceptance

1. Search never changes the admitted total or hides Start beneath a long roster.
2. Roster updates cannot move a different person under a pending Remove action.
3. Disconnected slots remain counted, and empty/full/history states do not invent new gameplay controls.

4. A failed connector cannot start a new timed game; outage after Start keeps existing timer rules.

**Verification:** Test readiness changing while the lobby is open.  100-row roster fixtures, normalized search, removal/update races, one-player Start, repeated clicks, and lost Start response.

## E4 S06 Reading and answer composer

**Outcome:** Players can read and explicitly submit while the timer follows server deadlines.

**Size:** 2. **Depends on:** E4-S05.

**Planned areas:** Player status strip, prompt, countdown, and editable answer phase.

### Work

- Build stable prompt/status/composer regions, circular/bar timer, readiness count, and global phase transitions. Reuse the basic prompt/timer on the host without an answer field; the full presentation treatment follows in E4-S10.
- Use desktop focus when permitted and phone tap-to-focus; preserve long-prompt scroll when Reading becomes Answering.
- Implement Enter/action-key submit, composition guard, empty/overlength errors, no autocorrect where supported, and rejection editing.

### Acceptance

1. Typed text is never auto-submitted and receipt at/after deadline is not locally accepted.
2. Timer/Submit remain reachable with a keyboard/short viewport, with manual scrolling rather than tiny text.
3. A rejection preserves editable wording/focus without revealing rarity or jumping the composer.

**Verification:** Viewport/input tests, exact phase-transition fixtures, IME/Enter handling, and an available real keyboard/phone smoke check.

## E4 S07 Locked pending and timeout player states

**Outcome:** The interface accurately represents accepted and uncertain submissions without score leakage.

**Size:** 2. **Depends on:** E4-S06.

**Planned areas:** Checking/confirming/accepted/missed/reconnecting player components.

### Work

- Freeze submitted wording while checking; after success show neutral acceptance and locked readable text.
- Dismiss the phone keyboard after acceptance or Answering closes, but retain focus for normal rejection.
- Resolve unknown acknowledgement through state before showing acceptance/miss/score; freeze draft editing during disconnection.

### Acceptance

1. Accepted zero points and a miss remain visually different after reveal but acceptance hints no tier beforehand.
2. Local timer zero shows closing/sync behavior without inventing a grace period or miss.
3. No late acknowledgement updates a newer round's composer, and no draft persists on refresh.

**Verification:** Lost acceptance/rejection replies, close-to-deadline submission, early closure, internet-loss/restore, and zero-point fixtures.

## E4 S08 Round results and phone navigation

**Outcome:** Players can understand their result and the room's answers within the timed reveal.

**Size:** 2. **Depends on:** E4-S07.

**Planned areas:** Personal result, grouped answers, unused example, standings, and mobile tabs.

### Work

- Show canonical answer/tier/points with submitted alias wording secondarily, then finalized totals.
- Implement Answers/Standings tabs below personal outcome/countdown, resetting only on a new round's results.
- Render point-ordered counts, unused example, shared ranks, leading rows and own row without player-answer attribution.

### Acceptance

1. Switching tabs or scrolling never pauses or delays the next server phase.
2. Zero-point valid answers, misses, all-used answers, no accepted answers, ties, and long labels render correctly.
3. Short/late phases and reduced motion bypass optional reveal animation.

**Verification:** Result fixtures and timed UI flow; assert no names attached to grouped answers and correct preserved tab state within a phase.

## E4 S09 Player and host final recaps

**Outcome:** Finished offers the appropriate private or aggregate review without saved-history features.

**Size:** 2. **Depends on:** E4-S08.

**Planned areas:** Finished screens, recap detail queries/cache, and new-game setup navigation.

### Work

- Show player final rank/total/own recap and host joint winners/complete standings/aggregate summaries.
- Request expandable completed-round details only in Finished and key local read-only caches by instance/game/round.
- Keep results while a new file is previewed; clear only after successful replacement and direct old players to the fresh invitation.

### Acceptance

1. The host has no fabricated personal result or private answer-to-player history.
2. Earlier-round browsing is absent during timed play and no full accepted-answer bank is returned.
3. No players remaining, joint winners, large scores, alias wording, and replacement are represented accurately.

**Verification:** Role-isolated recap tests, prohibited history requests, stale detail responses, failed/confirmed replacement, and empty standings.

## E4 S10 Clean host presentation and management overlay

**Outcome:** The host browser works as the agreed shared screen without losing administration.

**Size:** 2. **Depends on:** E4-S05, E4-S08, E4-S09.

**Planned areas:** Shared host prompt/result layout and Manage players overlay.

### Work

- Scale prompt/timer/progress/readiness for a shared display and use two-column results/top standings where space permits.
- Open searchable Manage players with visible phase/time and consistent stable removal confirmation.
- Keep timers running across overlays and phase changes, return focus safely, and handle replaced/removed targets.

### Acceptance

1. The host never gets an answer input or live player answers.
2. Typical content fits a 1920×1080 presentation; long valid text remains manually scrollable and readable.
3. Closing management returns to the current phase, not a stale presentation; no pause/skip/end controls appear.

**Verification:** Projection-size fixtures and actual display review where available, plus removal/phase-change/focus scenarios.

## E4 S11 Browser recovery and exception integration

**Outcome:** The complete browser app preserves the specified identities and truthful outcomes through faults.

**Size:** 2. **Depends on:** E4-S09, E4-S10.

**Planned areas:** Cross-screen recovery, terminal states, and operation-status UI.

### Work

- Exercise recoverable same-origin interruption and network change, terminal connector/endpoint loss requiring explicit fresh hosting, and provider failures. Reuse E1 recovery UI rather than promising Quick Tunnel hostname retention after process restart.

- Exercise reload, loaded-page reconnect, stale/copy proof, Take control here, and removal/replacement terminal views.
- Implement host-authority loss/recovery instructions and all waiting/page/handshake/admission-history capacity feedback.
- Keep sent host operations pending through dialog dismissal and reconcile APPLIED/NOT_APPLIED/SUPERSEDED safely.

### Acceptance

1. An old tab cannot automatically steal control, and stale metadata is not erased to fake a new tab.
2. No identity, score, locked answer, or committed game is duplicated by recovery.
3. Capacity or connection faults do not pretend an answer was rejected by the list or a game was not created.

4. Recovery at the same origin preserves locked state; endpoint loss/change offers explicit fresh hosting/game and invitation, never silent URL rotation. Final results remain reachable until Finish hosting or launcher quit.

**Verification:** Include Safari background/foreground and uncertain replies.  Production Playwright scenarios with dropped replies, socket interruption, multiple tabs, cookie loss, revoked owner, and stale frames.

## E4 S12 Built browser game across networks

**Outcome:** A user-visible host-and-two-player game works through to final recaps.

**Size:** 2. **Depends on:** E4-S11.

**Planned areas:** End-to-end production build and G4 evidence report.

### Work

- Run a multi-prompt real-server/browser flow using two distinct player sessions and the host.
- Use the real public tunnel with players on different networks and repeat import, invite/join, retry, lock, reveal, reconnect and final review; separately interrupt internet to verify truthful reconnect behavior.
- Review the story-level UI evidence and assign any remaining real-device/accessibility matrix checks to E6 explicitly.

### Acceptance

1. The game completes without developer intervention through the configured provider, with bundled assets served by the host.
2. Scores/frequencies/private results match the expected fixture and never leak before reveal.
3. The evidence distinguishes automated, available-device, and still-unrun target checks; no unrun UI criterion is reported passed.

**Verification:** Run impacted web/core/server suites and the production end-to-end cross-network scenario; record screenshots/steps and G4 functional completion.

## Epic gate

A host and two players complete the built UI game through the real tunnel on different networks, and all screen/recovery checks owned by E4 pass. Automated/available-device evidence is recorded honestly. Formal full browser/device/accessibility coverage remains assigned to E6; do not treat G4 as satisfying an unrun M4 device criterion.

Record evidence and the next eligible story using the master handoff template. Fix a failed owned acceptance check before marking its story Done; list externally owned checks without silently certifying them.

