# Niche Out release direction and private candidate history

## Local npm candidate — November 18, 2026

The [Epic 5 migration](../implementation/epic-05-npm-distribution.md) now produces a local CLI npm tarball containing compiled server/browser assets, a separate JSON import worker and four small native prebuilds. Hosts install Node `>=24.22.3 <25`; explicit prepare/Start obtains pinned cloudflared in a verified user cache. The package has no install hooks, user compilation or bundled Node. Players still use browsers and the game/Quick Tunnel behavior is unchanged.

**This is an unpublished, private test candidate, not a registry release.** `npm run package:npm` assembles `dist-npm/niche-out-0.1.0.tgz`. Local, user-prefix global and npm-exec installation with scripts ignored have passed on the available Apple Silicon Mac. An installed production-browser game and a 100-player/20-round mixed-transport game through the installed launcher's own Quick Tunnel passed. The scoped [implementation evidence](../implementation/evidence/EPIC-5-NPM.md) records exact candidate hashes, fixes, timings and unexecuted checks.

The registry name/ownership and publication permissions remain inputs. macOS/Windows native authentication, Linux/release inventory signatures and clean-target tests remain required; npm provenance does not replace them. The npm publisher pipeline is still Epic 6 work. Old standalone containers/verifiers/runtime archives are historical deliverables. See [active authenticity planning](SIGNING.md).

The source license is already MIT, Copyright (c) 2026 Kian Hong Tan. Publisher identity, native credentials, asset rights and third-party notice completion remain separate. E6-S06 now supplies npm schema-2 metadata, actual-tarball auditing, a review-only release planner, source provenance and bundled notice texts; actual authentication/publication execution remains later work.

## Historical portable candidate

This candidate supplies JSON-based custom games, manually assigned tiers/points, automatic timed rounds, shared winners, anonymous answer counts, host presentation, phone player screens, reconnect/tab recovery and managed temporary public hosting from a local laptop. The host can start and remove players; all game state is temporary.

Epic 6 adds repeatable capacity/recovery measurements, accessibility/responsive checks, bounded fixes from those checks and explicit release preparation/evidence. In the source checkout, read `docs/implementation/evidence/EPIC-6.md` and its linked reports for measured results; the full evidence is not bundled in the portable archive. These notes do not claim that a generated archive proves platform compatibility or that a local load result guarantees public-provider capacity.

## Current qualification limits

- One private npm tarball includes `darwin-arm64`, `darwin-x64`, `win32-x64` and `linux-x64` native helpers. Apple Silicon execution is recorded; Intel Mac, Windows 11 and Linux actual-machine validation remains owner-deferred. Cross-builds and a prepared, unexecuted CI matrix do not establish those platforms' compatibility. Earlier runtime-inclusive archives remain historical.
- No project-signed/notarized public release exists. Native payload authentication, publisher inputs, final notices, migrated release-audit tools and clean installation of final authenticated bytes remain Epic 6 gates.
- The available machine is a MacBook Pro M3 Pro with 18 GiB RAM; results on it do not establish an 8 GiB reference-host guarantee. Simulated clients do not establish 100 physical-phone performance.
- Earlier user evidence covers iPhone Safari over cellular with the Mac on eduroam, QR join, keyboard behavior and completed gameplay. Current smartphone viewport tests are not additional physical iOS/Android keyboard or assistive-technology certification.
- Actual venue reliability, provider request headroom and cross-network behavior must be interpreted from the exact tested workload. The installed npm mixed run used 80 WebSocket and 20 polling players on eduroam; one polling DNS error recovered. It is not an all-polling or outage-free claim. Quick Tunnels are temporary, lack an uptime guarantee and have provider limits.
- Physical sleep/wake, manual system-clock changes, clean-machine quarantine/reputation behavior and all supported browser/OS versions need their specifically declared evidence.

## Deliberate prototype limits

One active game per host, up to 100 admitted players, 1–20 prompts, 10 MiB maximum JSON, English prototype content, no in-app pack editor, no fuzzy matching/LLM answer judge, no player accounts, no history/export/restart recovery, no late newcomers after Start, no pause/skip/manual score adjustment and no rematch retaining players. Drafts clear on refresh; accepted answers survive same-origin reconnect. New public origin means a fresh session. Custom time settings remain in JSON; omitted durations are 3/25/10 seconds.

## Notice findings

The npm release notice inventory covers 105 source production installation paths plus the esbuild generated-helper notice; 99 paths are in the external installed runtime graph. Most ship complete standalone license files. `abstract-logging@2.0.1` ships a README link to an external MIT license rather than the full text; the authoritative link was unreachable during this review, so complete upstream permission/copyright text remains unresolved. `xmlhttprequest-ssl` lacks a lockfile license identifier but includes full MIT text; this is a metadata warning, not a missing-text claim. Node's license, cloudflared's Apache license and VT323's OFL notice are present in all existing staging manifests. cloudflared transitive Go dependency notices and original-asset rights review still need completion before public redistribution. The source license is already MIT; release metadata must be reconciled.

For manual operating steps use the [operator guide](OPERATOR-GUIDE.md); for exact outstanding signing actions use [SIGNING.md](SIGNING.md). Nothing was published.
