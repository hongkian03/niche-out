# Epic 7 · Shared host reveal

The built host view plays a 600 ms sonar pulse along the prompt panel border when an observed Answering phase enters Results. Players on their own devices use the Follow dive. The host's prompt, grouped counts, standings, countdown and Manage players stay available during the sweep. The existing grouped answers and standings serve as the room's score summary.

Host and player cues use the same local lifecycle observer. An exact phase match prevents repeated playback on standings updates. Short Results windows, reduced motion, backgrounding, reconnect and mid-Results reload display the current settled presentation. [Lifecycle](../../../apps/web/src/round-reveal.ts) · [Host presentation](../../../apps/web/src/Host.tsx)

Four focused Chrome test groups at 1920 × 1080 passed. They verify the 600 ms timing, stable rows across a 100-player tie, grouped counts, retained focus in Manage players, empty results and safe phase recovery. The same cue was observed in a built game over local HTTPS with one host and four browser players. [Browser tests](../../../probes/web/host-reveal.mjs)
