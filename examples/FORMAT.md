# Writing a prompt pack

Copy [game.example.json](game.example.json) and edit it as UTF-8 JSON. A pack contains a numeric `schemaVersion` of 1, at least one tier and 1–20 prompts, played in array order. Each prompt needs at least one accepted answer. The upload limit is 10 MiB. The file size and available memory govern how many answers and aliases fit.

| Field | Authoring rule |
| --- | --- |
| title | Optional, defaults to Custom Game. After trimming outer Unicode whitespace, use 1–256 code points. Internal spacing stays as authored. |
| settings | Optional. Set readingSeconds, answerSeconds or resultsSeconds for the whole game. Omitted values use 3, 25 and 10 seconds respectively. Each value must be between 0.1 and 600 seconds in whole milliseconds. |
| tiers | Each tier has a unique id (up to 64 code points), name (up to 128), and nonnegative safe integer points. The sum of the highest reachable scores for the prompts must fit in a safe integer (9,007,199,254,740,991). |
| prompts | Each prompt has a unique id (up to 64 code points), text (up to 4,096), and an ordered answers array. |
| answers | Each answer has text (up to 512 code points), tierId matching a tier id exactly, and an optional aliases array. Each alias also allows 512 code points. Omitted aliases default to an empty list. |

All required strings must contain a non-whitespace character. Fields at every level are case-sensitive. Extra fields cause an error. Keep answer text and aliases unique within a prompt after normalization. Multiple spellings that normalize to the same key may belong to the same answer. An answer's points come from its tier. The JSON order breaks ties when choosing an unused example.

Matching uses Unicode NFC, trims and collapses Unicode White_Space to single spaces, then applies locale-independent Unicode lowercasing. For example, “Café” also matches “CAFÉ” with a combining accent. “Cafe” needs an explicit alias. “Straße” and “STRASSE” have distinct matching keys. The submitted spelling and the author's display text stay available separately. A code point can occupy two UTF-16 units, and one visible character can contain multiple code points.

The shared shape validator is in [pack.ts](../packages/contracts/src/pack.ts). It checks structure, limits, IDs, tier references, and safe total points and returns field paths. E2-S01 owns the additional canonical-answer and alias collision checks during index compilation.
