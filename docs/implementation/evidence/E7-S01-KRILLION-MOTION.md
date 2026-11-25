# Epic 7 reference study · Krillion’s score and room feedback

Observed November 19, 2026. This study pairs a fresh Daily Dive inspection and a fresh Puffer Party lobby inspection with the project’s earlier desktop and mobile stills. The original game is `krillion.io`. Several other sites use similar names and implement different scoring or room modes. The first-party rules and visible original UI are the reference here. [Daily Dive](https://krillion.io/) · [Puffer Party](https://krillion.io/party) · [Creator FAQ](https://krillion.io/faq)

## Daily Dive

| Moment | What the original communicates | Evidence |
| --- | --- | --- |
| Entry and reading | The surface, boat and initial depth give the dive a starting place. A short reading countdown precedes entry. The top HUD separates depth, prompt progress and score. A graduated ruler on the right gives motion a reference point. | Fresh Daily Dive #127 inspection and [earlier desktop entry](../../krillion-reference/01-original-entry.jpg). |
| Active prompt | A central question and low-position answer controls let the background remain visible. The reply to an invalid answer sits near the composer, retains the draft and leaves retry available while the timer runs. | [Desktop prompt](../../krillion-reference/02-original-prompt.jpg) · [Mobile rejection](../../krillion-reference/06-original-rejection.jpg). |
| Award | A valid answer leads to a descent and a central outcome. The settled outcome combines an illustration, tier label, canonical answer, awarded points, depth change and a short description. The top score and depth readouts show where the player ended up. | Fresh low, middle and high awards, [shallow result](../../krillion-reference/05-original-mobile-result.jpg) and [Rare result](../../krillion-reference/07-original-rare-result.jpg). |
| Miss | No score gain or descent for the round. The result plainly shows that the timer expired without an accepted answer. | [Desktop miss](../../krillion-reference/03-original-miss.jpg). |
| Continue and recap | A manual Descend action leaves the settled reward readable until the player advances. The end of the dive shows total points, total depth, a daily comparison curve/percentile and a per-prompt dive log. It also offers score-band interpretation, sharing and expandable round details. | Fresh manual advances, an already-completed summary inspection and [mobile recap](../../krillion-reference/08-original-mobile-summary.jpg) · [desktop recap](../../krillion-reference/10-original-desktop-summary.jpg). |

### The tier ladder

The six labels and point values were exposed in the Daily Dive’s browser accessibility tree during the research round. Four played awards explicitly showed the distance delta. The earlier 140-point recap also showed a depth magnitude of 1,400 m. The two unobserved distances extend the ten-metres-per-point relationship from those samples and are marked as inferred.

| Daily Dive tier | Points | Distance using the observed relationship |
| --- | ---: | ---: |
| Plankton | 10 | 100 m, observed |
| Too Clever | 15 | 150 m, inferred from points |
| Schooler | 30 | 300 m, observed |
| Rare | 60 | 600 m, observed |
| Deep Cut | 85 | 850 m, observed |
| One in a Krillion | 100 | 1,000 m, inferred from points |

The creator describes answer sets curated from different sources. Familiarity data can determine rarity for some prompts, and assisted editorial judgment is used for others. The top gem can be selected for being satisfying to discover. These tiers are editorial outcomes, so live local room frequencies are a different concept. [Creator FAQ](https://krillion.io/faq)

### What moves, and what communicates the payoff

| Fresh sampled result | Numeric outcome | Visual treatment |
| --- | --- | --- |
| Plankton | +10 points and +100 m, starting at the surface. The depth readout showed 2 m before settling. | A muted, pale bubble illustration on the result. Daylight, boat and shallow scenery remain in view. |
| Rare | +60 points and +600 m, settled at 70 points and 700 m total after the earlier answer. | A red glow around a squid-like illustration and a stronger label accent against darker water. |
| Schooler | +30 points and +300 m, settled at 100 points and 1,000 m total. | During travel, a cyan answer token, bubbles and a school of fish accompany the movement through dashed depth markers. |
| Deep Cut | +85 points and +850 m, settled at 185 points and 1,850 m total. | Purple headline and point delta, with a softly glowing anglerfish-like illustration. |

The Schooler sequence gives the clearest mid-motion view:

1. The answer composer recedes while the prompt briefly remains. The canonical answer becomes a cyan token marked with a downward cue.
2. The token drops relative to the viewport. The graduated world and dashed tier markers scroll upward behind it as depth ticks up. The sampled target was 1,000 m from a 700 m start, with lower markers at 800 m and 850 m. The HUD containers stay anchored, and the score was still 70 during the early frames.
3. At the settled state the moving token and tier markers yield to the tier label, canonical answer, +30 points, 300 m gain, new cumulative readings and manual Descend action. The ambient character is separate from the answer token.

Score magnitude shows up through travel, cumulative depth, label, illustration and numeric delta. Colour reinforces the distinction. Exact easing, per-tier duration and the top-tier visual treatment were not established. The creator’s official FAQ explains curation and gem selection. It does not specify these animation internals. [Daily Dive](https://krillion.io/) · [Creator FAQ](https://krillion.io/faq)

The transferable pattern is **event → visible movement → readable payoff → persistent trail**. On Niche Out the room already has a clock and the result text needs a guaranteed reading window. A short local cue can express the reward while the actual result, timer and standings are readable immediately. A recap can retain each round’s payoff without adopting global percentiles or the fixed metre scale.

## Puffer Party

### Firsthand lobby observation

The original `/party` loaded in an isolated desktop Chrome session. The lobby has one puffer as its focal image, a player identity/avatar area, a How to Play action, matchmaking controls and room controls. The public room list shows room status and capacity. The visible matchmaking choices included 1v1, 3, 4–6 and 8–10 players during the check. The private/public setting and join-by-code flow are separate from matchmaking. Opening the rules and changing the room-type toggle for inspection were sufficient to establish the lobby affordances. [Original Puffer Party](https://krillion.io/party)

The in-game rules shown from the lobby say that a valid answer passes the puffer, duplicate answers for the current question are disallowed, and rarer answers help earn an extra heart. The goal is to be the last player left. The creator’s FAQ describes a shared hidden 10–30 second fuse under defaults. Passing carries the remaining fuse forward, with an eight-second floor on a pass. A pop starts a new randomized fuse, and lag can cause a visible turn or pop to appear stale. [Creator FAQ](https://krillion.io/faq)

### Room reference

A dated walkthrough of the original room includes separate desktop and 390 px firsthand screenshots of a waiting room. They show an arena and seat markers around a shared focal puffer, a seated avatar with identity and hearts, a room code and readiness, and prominent invite/start controls. The phone composition stacks setup around the arena. Treat those images as evidence of room layout at that capture date. [Third-party capture of the original room](https://nisu.io/guides/krillion-multiplayer/)

### In-match footage

A public recording of an original ranked match provided the live sequence. The observer sampled approximately 2:00–2:31. The fixed seabed arena shows named seats and hearts. Prompt and remaining player count stay above it. An outline and explicit turn text point to the active seat, with answer controls below. The puffer grows, moves and changes orientation as the turn state changes. The timer and screen treatment signal urgency. [Public ranked footage, beginning around 2:00](https://www.youtube.com/watch?v=8jAEzL9N23g&t=120s)

| Sample | Visual change | What the room learns |
| --- | --- | --- |
| Around 2:17 | A just-accepted answer and tier appear by the answering seat. The puffer shifts with a short trail and the next seat/text are highlighted. | The answer passed the turn, and another player is now active. |
| Around 2:22–2:28 | The puffer swells, then a burst accompanies the player count dropping from seven to six. A seat clears, the category changes, and the new prompt/turn controls settle into place. | The room lost a player and has entered a new category. |
| Around 2:31 | Brief answer chips and a tier result coexist with the moving token and the active seat. | A personal success belongs to a clear room event. |

These are video timestamps used to find the examples. They do not measure duration or prove server timing, and the research did not include playing a live multiplayer match. The useful feature is how persistent text and motion agree. The original recording shows player-linked answer chips. Niche Out already separates private answers from shared counts, so a shared pulse and anonymous summary fit its own interaction and data model. [Public ranked footage, pop and category change](https://www.youtube.com/watch?v=8jAEzL9N23g&t=139s)

## What transfers into Niche Out

| Reference principle | Niche Out application | How to tell it works |
| --- | --- | --- |
| A measurable event changes something visible in the world. | Use the original research submarine and a short local telemetry inset when authorized Results arrives. Try constant versus authored-score-calibrated travel. | At a glance, a player reads what was accepted, what it earned and whether the visual reward was small or strong. |
| A shared object tells everyone where the room is in the flow. | One host sonar cue at the Results boundary. The room reacts to grouped answers and standings while phones show personal outcomes. | Two phones and a host can describe the same completed round under ordinary arrival differences. |
| Spatial context helps orient the next action. | Preserve the standing game clock and fixed control locations. Keep community movement in the existing scene or result area. | A user can submit, switch tabs and read the next deadline at narrow widths without waiting for motion. |
| A history view keeps the experience meaningful after the moment. | Existing personal recap and shared standings remain the record. A static point strip can be considered if the prototype benefits from it. | Ties, misses, valid zero and arbitrary custom point values are understandable without colour or animation. |

The source room’s turn-by-turn elimination loop is a different ruleset. Niche Out’s shared event is **the server closing a round for everyone**. Its individual event is **the server revealing that player’s accepted outcome or miss**. The best multiplayer adaptation is the combination of one shared transition with one private reward, the current code and QR flow, and the same local timed scoring rules.

## Open evidence and design decisions

- The Epic 7 prototype should decide whether a compact inset or a more prominent scene treatment feels better at phone scale, and whether the same-duration motion can distinguish a few reward strengths.
- Compare a uniform accepted cue against bands calibrated by authorized scores. The answer tier in a custom game is arbitrary and its awarded value remains exact. A player’s Results view currently carries the awarded value but lacks a full tier scale. Any needed server cue should be bounded and reveal-only.
- Compare the shared host cue with and without an aggregate distribution. It should stay readable at 100 participants, respect ties and retain grouped answer privacy. Use the existing player cap and authorized projections as the design inputs.
- Run the future motion prototype using representative device, keyboard, reconnect and reduced-motion cases. Research on Krillion is reference evidence for the design, while those checks will qualify the Niche Out implementation.

See the [Epic 7 plan](../epic-07-player-motion.md) for the proposed flow, constraints, and story sequence.
