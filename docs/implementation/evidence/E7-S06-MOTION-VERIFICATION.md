# Epic 7 · Motion verification

The production host and player reveals were exercised together in Chrome 158.0.8127.37 on a physical MacBook Pro with an Apple M3 Pro, 18 GB memory and macOS 26.5.2. The browser used 320 px and 390 px phone layouts and a 1920 × 1080 host layout. Chrome viewport sizes represent the phone and projector checks.

## Live multiplayer

One host and four players completed matching normal-motion and reduced-motion games against the built game server over private local HTTPS. The game exercised early completion, deadline expiry, a miss, an accepted zero, Results reload, offline/online recovery, player removal while Manage players was open, and control takeover using a copied continuation. The final standings were 72, 72 and 12 points at ranks 1, 1 and 3. A separate live 100 ms Results game settled immediately on both host and player and reached the expected final score.

In the matched round, one Results transition and six same-phase view updates produced exactly seven Results publications per browser in both runs. The existing periodic clock samples accounted for outgoing application traffic during the sampled window. A 2.2-second requestAnimationFrame sample across the host and both phone-width pages had 16.7–16.8 ms p95 frame intervals and zero intervals over 33 ms in either run. These are browser callback timing samples on the Mac under the matched local workload.

[Multiplayer trace](../../../work/e7-motion/e7-s06/multiplayer-motion.json) · [Host during sonar](../../../work/e7-motion/e7-s06/projector-host.png)

## Layout and accessibility

A 1920 × 1080 browser fixture kept 100 tied players' standings usable. Phone and desktop checks covered long content, 200% equivalent reflow, keyboard focus and tabs, and reduced motion. The expanded axe audit tested both reveals during motion and after settlement. It found a missing accessible landmark and heading during the full-screen player dive. The app now provides a visually hidden “Revealing your score” heading and main landmark until Results returns. [Accessibility audit](../../../scripts/test-accessibility.mjs) · [Browser layout checks](../../../scripts/test-web-layout.mjs)

Typecheck, the production build and all 487 application tests passed. The layout suite passed 213 checks and the player and host reveal scenarios. The expanded axe run passed all 92 checks with zero violations. Axe marked some colour-contrast cases incomplete. The separate palette contrast checks passed.

In Mobile Safari on an iPhone 17 Pro simulator running iOS 26.1, the player fixture opened the software keyboard on tap, accepted typing and submission from the keyboard, dismissed it at the Results transition, and showed the awarded points, alias and countdown. Disk exhaustion interrupted the first simulator and desktop runs. The disposable simulator was removed, and the relevant checks were rerun after disk space recovered.

Physical phone keyboard and IME behavior, actual projector output, native tab duplication, and spoken assistive-technology behavior remain release-verification items.
