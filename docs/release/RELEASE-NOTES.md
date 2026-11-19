# Niche Out release direction and private candidate history

## Planned npm distribution

The [Epic 5 migration](../implementation/epic-05-npm-distribution.md) replaces runtime-inclusive archives with one public CLI npm package containing compiled assets and four small native prebuilds. Hosts install Node `>=24.22.3 <25`; explicit prepare/Start obtains pinned cloudflared in a verified user cache. No install hooks, user compilation or bundled Node are planned. Players still use browsers and the game/Quick Tunnel behavior is unchanged.

**Planning only: no npm package or migrated publisher pipeline exists yet.** The exact name and publication permissions remain inputs. macOS/Windows native authentication, Linux/release inventory signatures and clean-target tests remain required; npm provenance does not replace them. Old standalone containers/verifiers/runtime archives are historical deliverables. See [active authenticity planning](SIGNING.md).

The source license is already MIT, Copyright (c) 2026 Kian Hong Tan. Publisher identity, native credentials, asset rights and third-party notice completion remain separate. Legacy candidate metadata/release tools still need implementation changes.

## Historical portable candidate

This candidate supplies JSON-based custom games, manually assigned tiers/points, automatic timed rounds, shared winners, anonymous answer counts, host presentation, phone player screens, reconnect/tab recovery and managed temporary public hosting from a local laptop. The host can start and remove players; all game state is temporary.

Epic 6 adds repeatable capacity/recovery measurements, accessibility/responsive checks, bounded fixes from those checks and explicit release preparation/evidence. In the source checkout, read `docs/implementation/evidence/EPIC-6.md` and its linked reports for measured results; the full evidence is not bundled in the portable archive. These notes do not claim that a generated archive proves platform compatibility or that a local load result guarantees public-provider capacity.

## Current qualification limits

- Four private artifacts are assembled with their runtimes/connectors; Mac Apple Silicon has prior extraction/real-tunnel gameplay evidence. Intel Mac, Windows and Linux actual-machine validation is deferred by the owner until after Epic 6.
- No project-signed/notarized public release exists. The npm plan replaces standalone container/bootstrap work with native payload authentication, publisher inputs, notices and clean npm-install evidence; none is passed by this planning update.
- The available machine is a MacBook Pro M3 Pro with 18 GiB RAM; results on it do not establish an 8 GiB reference-host guarantee. Simulated clients do not establish 100 physical-phone performance.
- Earlier user evidence covers iPhone Safari over cellular with the Mac on eduroam, QR join, keyboard behavior and completed gameplay. Current smartphone viewport tests are not additional physical iOS/Android keyboard or assistive-technology certification.
- Actual venue reliability, provider request headroom and cross-network behavior must be interpreted from the exact tested workload. Quick Tunnels are temporary, lack an uptime guarantee and have provider limits.
- Physical sleep/wake, manual system-clock changes, clean-machine quarantine/reputation behavior and all supported browser/OS versions need their specifically declared evidence.

## Deliberate prototype limits

One active game per host, up to 100 admitted players, 1–20 prompts, 10 MiB maximum JSON, English prototype content, no in-app pack editor, no fuzzy matching/LLM answer judge, no player accounts, no history/export/restart recovery, no late newcomers after Start, no pause/skip/manual score adjustment and no rematch retaining players. Drafts clear on refresh; accepted answers survive same-origin reconnect. New public origin means a fresh session. Custom time settings remain in JSON; omitted durations are 3/25/10 seconds.

## Notice findings

The dependency inventory covers 105 production installation paths. Most ship complete standalone license files. `abstract-logging@2.0.1` ships a README link to an external MIT license rather than the full text; the authoritative link was unreachable during this review, so complete upstream permission/copyright text remains unresolved. `xmlhttprequest-ssl` lacks a lockfile license identifier but includes full MIT text; this is a metadata warning, not a missing-text claim. Node's license, cloudflared's Apache license and VT323's OFL notice are present in all existing staging manifests. cloudflared transitive Go dependency notices and original-asset rights review still need completion before public redistribution. The source license is already MIT; release metadata must be reconciled.

For manual operating steps use the [operator guide](OPERATOR-GUIDE.md); for exact outstanding signing actions use [SIGNING.md](SIGNING.md). Nothing was published.
