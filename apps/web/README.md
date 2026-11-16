# Browser game

The normal launcher serves this Vite/React build through the hosting session's public HTTPS origin. Host and player screens use the production protocol; this package contains no answer bank, scorer, independent phase scheduler, or room database.

## Read the implementation

| File | Responsibility |
| --- | --- |
| `src/App.tsx`, `main.tsx` | One client/store per loaded page, role routing, owner-conflict/recovery entry, document title and scenery. |
| `src/client.ts` | Strict response schemas, discovery, owner exchange, tab continuation, Socket.IO, complete views, clock offset, bounded retries and authoritative reconciliation. |
| `src/Host.tsx`, `host-helpers.ts` | File validation/review/commit, public invitations, roster/search/removal, shared presentation and aggregate final recaps. |
| `src/Player.tsx`, `player-helpers.ts` | Admission, in-memory answer draft, reading/answering/acceptance, results tabs, personal final recap and recovery screens. |
| `src/components.tsx`, `styles.css` | Native modal dialogs with explicit Tab containment, deadline display, standings, grouped results, recap rows, original SVG ocean/submarine and responsive visual tokens. |
| `public/`, `src/assets/` | Public authoring example/help, license notices, and bundled VT323 font. No external asset requests are needed. |

`GameClient` exposes a stable `subscribe`/`getSnapshot` pair for `useSyncExternalStore`. The client accepts only views permitted for its discovered role and current instance/game, rejecting stale revisions and obsolete control grants. It seeds the browser/server clock offset from the first authorized view, refines it using the lowest-RTT sample of three, and resamples every 30 seconds. Countdown rendering does not advance the game. Local zero disables submission while waiting for the server's next phase.

Only continuation metadata and the identity of an uncertain host operation live in per-tab session storage. Unsubmitted answers live in the loaded `LiveRound` component and disappear on reload or a different round. An outage preserves that in-memory draft but freezes editing until synchronization. Accepted text and points always come from the server. Host operation metadata remains pending until an authoritative result establishes whether it applied; dismissing a dialog never cancels a sent mutation.

## Verify

From the project root, with Node 24.22.3 selected:

```sh
npm run test:web
npm run test:web:layout
npm run test:web:tunnel
```

The unit suites cover the store through injected HTTP/socket ports and render role-specific components with SSR. The isolated `probes/web` build adds real Chrome keyboard, focus, layout and motion checks. It never ships as a production route. The tunnel harness exercises real built screens and server behavior, including an actually lost commit reply and connector interruption. It closes its owned processes after the automatic run.

Use `npm run host` for ordinary manual play, or `npm run probe:web` for the guided Phone/Auto test. A physical phone's keyboard, OS composition, browser suspension, and assistive technology behavior cannot be inferred from a desktop viewport fixture; the evidence report distinguishes these checks. Portable packaging belongs to Epic 5; broader device/capacity/accessibility qualification belongs to Epic 6.

[UI baseline](../../docs/UI-UX.md) · [Architecture](../../docs/ARCHITECTURE.md) · [Epic 4 verification](../../docs/implementation/evidence/EPIC-4.md)
