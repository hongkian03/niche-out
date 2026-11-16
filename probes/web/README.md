# Browser UI fixtures

Run `node scripts/test-web-layout.mjs` from the project root with the pinned Node runtime and installed Chrome. The script builds this fixture entry with Vite into `work/web-fixtures`, serves it on an ephemeral loopback port, runs headless Chrome checks, and closes Chrome and the server. It does not start a tunnel or a game server.

The fixture app imports the production App, Host, Player, shared components, stylesheet, and bundled font. Its fake client supplies schema-validated complete views; it does not implement alternate gameplay rules. This entry is separate from the production Vite root and is never a production route or runtime asset.

Coverage includes 100-player rosters, maximum-length unbroken text, safe-integer scores, accepted zeroes versus misses, unused/all-used answers, empty final standings, pending and reconnecting views, modal containment/restoration, and reduced motion. Layout checks cover 320, 390, 768, 1280, and 1920 CSS-pixel widths. A 640×450 viewport simulates the reflow space of a 1280×900 window at 200%; this is not an assertion about actual browser zoom. A short viewport checks that Submit is reachable by manual scrolling, not that a physical phone keyboard was tested.

`work/web-ui/layout-report.json` records the environment, checks, limitations, and screenshots. If a later interaction assertion fails, `layout-partial.json` retains the completed layout measurements. Screenshots are representative viewport captures, not a claim that all maximum-length content fits without scrolling. Text and control contrast calculations use the actual stylesheet tokens on opaque panels; broader accessibility and device validation remain in Epic 6.

The production end-to-end protocol and cross-network checks are owned by `scripts/test-browser-game.mjs`, not this harness.
