# Epic 7 · Full-screen dive prototype

The prototype uses Niche Out's submarine and an original layered ocean scene. The player sees a personal, tier-dependent dive when positive points are awarded. The host has two shared sonar treatments for the same Results phase.

## Player storyboard

| Beat | What the player sees |
| --- | --- |
| Read and answer | The prompt, timer, answer field and live count are available. An accepted answer locks and waits for the round to end. |
| Dive begins | On the live transition to Results, the game panels briefly disappear. The submarine takes the viewport. Follow holds the opening frame for 250 ms before moving. |
| Descent | The submarine drops and the terrain rises past it. A stronger tier travels farther in either camera treatment. |
| Landing | The point value and tier appear beside the submarine as it levels off. Follow holds the settled shot for another 300 ms before the results panels return. |
| Results return | The canonical answer, submitted alias when applicable, tier, points, countdown, grouped answers, unused example and standings appear. The countdown already reflects time spent in the dive. |
| Next phase | The server deadline governs round advancement. The final recap still contains the previous results. |

**Wide dive** emphasizes the craft moving down the screen. **Follow dive** emphasizes the water and rock moving up around it. Both are shown with the same fixture awards.

| Sample award | Wide craft drop | Follow craft drop | Wide scenery rise | Follow scenery rise |
| --- | ---: | ---: | ---: | ---: |
| Surface Find · +12 | 18% | 12% | 14% | 31% |
| Signal Find · +38 | 34% | 22% | 32% | 60% |
| Trench Find · +72 | 52% | 34% | 53% | 92% |

Travel is measured relative to viewport height. The three bands are assigned by the fixture. Niche Out's authored score values remain exact and the production mapping is still a design decision.

Accepted zero-point answers and misses go straight to their distinct results. Reduced motion, a short results window and direct entry to Results also show panels immediately. Follow runs for 1.95 seconds, including both holds. It requires at least 2.95 seconds left in Results to leave a reading margin. Wide runs for 1.4 seconds and requires at least 2.4 seconds left. Its cinematic has no focusable content. The results regain normal keyboard and screen-reader access once the dive ends.

## Follow dive timing feedback

The November 24 sample game recording is the baseline for this iteration. Its three Follow dives begin around 0:30, 1:08 and 1:46. The recording lives in `work/e7-motion/reference/2026-11-24-sample-game-follow-dive.webm`.

- **Lead-in.** The baseline descent starts too abruptly. The revised Follow dive holds the opening frame for 250 ms before the submarine and scenery begin moving.
- **Landing hold.** The baseline cuts back to the results too abruptly. The revised dive holds the settled submarine, tier and points for 300 ms after the animation finishes.

The revised 14.6-second clip is in `work/e7-motion/reference/2026-11-24-follow-dive-pacing-v2.webm`. It shows the last seconds of Answering, the +72 Follow dive around 0:04, the returned results, and the next prompt around 0:14. Playback and representative frames were checked.

The owner approved the revised Follow dive on November 24, 2026. Use its 250 ms lead-in, 300 ms landing hold, and 1.95-second total duration as the baseline for live-game integration. The countdown continues through both holds, with enough time left to read the results. Short results windows and reduced motion still show results immediately.

## Shared host display

The host continues to show the prompt, clock and readiness count during answering. Results offer a brief shared sonar pulse with an optional anonymous distribution of awarded points. Grouped answers and standings are available immediately. The Manage players action is available throughout. Each player gets their own private dive during the same round transition.

## Review

Run the local fixture with the project's supported Node.js version.

```sh
node probes/web/motion/preview.mjs
```

Open http://127.0.0.1:4177/motion-preview/. The page opens on the preview controls.

- **Compare Follow tiers** opens a side-by-side view of all three positive tiers at their landing positions. **Replay all three** starts the dives together. The dashed line marks their common starting height, and each panel lists actual submarine and terrain travel.
- Set **Outcome**, then click **Wide dive** or **Follow dive** to play that reveal immediately. Click either camera button again to replay. The final result stays available for inspection.
- **Play sample game** runs all three rounds and opens final standings and the recap. Try **Mesosphere**, **Hyperion** and **Anemometer** in order. Each answer window runs on its timer. Click the button again after the recap to start over.
- **View → Host** switches to shared-screen controls. **Advanced preview controls** contains the individual phase buttons and the static and short-reveal settings.

```sh
node probes/web/motion/capture.mjs
python3 probes/web/motion/render-captures.py
```

These commands regenerate `work/e7-motion/captures/`. Review `player-flow.png`, `high-dive-frames.png`, `wide-dive-tiers.png` and `follow-dive-tiers.png` for the visual sequence. `player-round.gif` moves through a full reveal. `wide-dive-tiers.gif` and `follow-dive-tiers.gif` play each tier side by side. `host-round.gif` shows the shared-screen flow. `checks.json` records the browser assertions.

Chrome fixture checks cover hidden and restored panels, measured tier travel, positive awards with reduced motion or short timing, zero and miss states, direct Results entry, alias display, standings tabs, recap, and host readiness and removal. The cinematic has a true desktop layout and was reviewed with phone-sized Chrome viewports. Real-device playback and production lifecycle integration belong to later stories.
