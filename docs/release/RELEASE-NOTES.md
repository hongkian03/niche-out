# Niche Out release direction and private candidate history

## 0.1.1 — November 19, 2026

### Changed

- The npm package README now comes from the repository README, so installation instructions, gameplay guidance, examples, credits and network limitations share one source.
- Removed the separate generated README that described the npm package as an unpublished candidate.
- Updated current quick-start commands to `niche-out@0.1.1` and linked these release notes from the README.
- Packaging preserves links to shipped files and redirects omitted source-document links to GitHub.

This is a documentation/packaging patch. Game rules, server/browser runtime, native helpers, runtime dependency versions and connector behavior are unchanged. Existing platform/network qualification limits still apply.

## Published 0.1.0 — November 19, 2026

[Niche Out 0.1.0](https://www.npmjs.com/package/niche-out) is the first public npm release, published by `hongkian03` after owner authorization. The [S12 record](https://github.com/hongkian03/niche-out/blob/main/docs/implementation/evidence/E6-S12.md) confirms exact reviewed tarball integrity, a fresh public-registry installation, the Singapore import worker and native/local-launcher startup/cleanup. Run `npm exec --yes --ignore-scripts --package=niche-out@0.1.0 -- niche-out` with supported Node `>=24.22.3 <25`.

This changes distribution availability, not game rules or platform/network qualification. The immutable package retains prepublication wording in bundled guides; the repository README/operator guide contain current public commands. Older private-candidate statements below describe their dated snapshots. No replacement `0.1.0` or additional version was uploaded.

## Lean initial npm release policy — November 19, 2026

This owner-approved policy supersedes earlier mandatory paid publisher-signing and exhaustive qualification wording. A scoped first release requires an exact installable npm tarball, intact resource/native/connector digests, source/dependency traceability, complete license notices, meaningful functional/security/recovery checks, accurate platform/network limitations, and explicit publication approval. Keep any platform-required or linker-generated ad-hoc signatures. Paid Apple Developer ID/notarization, Windows publisher certificates, independently signed Linux/native inventories and a desktop installer/container are optional future enhancements, not initial-release gates.

Release claims must match executed evidence. The available Apple Silicon Mac may qualify the initial release while bundled Intel/Windows/Linux targets remain clearly unverified/experimental pending the owner's manual testing. Exhaustive OS/browser/phone, physical sleep/network outage, 8 GiB reference-host, actual-venue, all-polling and repeated stress qualification are follow-up evidence for the corresponding compatibility/capacity/event claims, not universal prerequisites to publish a scoped prototype. Preserve their known limitations and prior results; a game correctness, credential/privacy, dependency-integrity or representative supported-path regression still blocks release. Registry readback of the approved bytes is required after publication; hosted provenance/trusted publishing is recommended when available, without requiring a new CI publishing system for the first authorized release.


## Local npm candidate — November 18, 2026

The [Epic 5 migration](https://github.com/hongkian03/niche-out/blob/main/docs/implementation/epic-05-npm-distribution.md) now produces a local CLI npm tarball containing compiled server/browser assets, a separate JSON import worker and four small native prebuilds. Hosts install Node `>=24.22.3 <25`; explicit prepare/Start obtains pinned cloudflared in a verified user cache. The package has no install hooks, user compilation or bundled Node. Players still use browsers and the game/Quick Tunnel behavior is unchanged.

**This is an unpublished, private test candidate, not a registry release.** `npm run package:npm` assembles `dist-npm/niche-out-0.1.0.tgz`. Local, user-prefix global and npm-exec installation with scripts ignored have passed on the available Apple Silicon Mac. An installed production-browser game and a 100-player/20-round mixed-transport game through the installed launcher's own Quick Tunnel passed. The scoped [implementation evidence](https://github.com/hongkian03/niche-out/blob/main/docs/implementation/evidence/EPIC-5-NPM.md) records exact candidate hashes, fixes, timings and unexecuted checks.

Account `hongkian03`, publisher display name and original-material approvals are recorded; name availability must be rechecked at first publication. Paid macOS/Windows native authentication and independent Linux signatures are optional future enhancements. Exact package integrity, notices, representative installed execution and explicit publication approval remain required. The npm publisher pipeline is still Epic 6 work. Old standalone containers/verifiers/runtime archives are historical deliverables. See [active authenticity planning](SIGNING.md).

The source license is already MIT, Copyright (c) 2026 Kian Hong Tan. Publisher/original-material approvals and technical notice review are complete; optional native credentials are not initial-release inputs. E6-S06 now supplies npm schema-2 metadata, actual-tarball auditing, a review-only release planner, source provenance and bundled notice texts; actual authentication/publication execution remains later work.

## Historical portable candidate

This candidate supplies JSON-based custom games, manually assigned tiers/points, automatic timed rounds, shared winners, anonymous answer counts, host presentation, phone player screens, reconnect/tab recovery and managed temporary public hosting from a local laptop. The host can start and remove players; all game state is temporary.

Epic 6 adds repeatable capacity/recovery measurements, accessibility/responsive checks, bounded fixes from those checks and explicit release preparation/evidence. In the source checkout, read `docs/implementation/evidence/EPIC-6.md` and its linked reports for measured results; the full evidence is not bundled in the portable archive. These notes do not claim that a generated archive proves platform compatibility or that a local load result guarantees public-provider capacity.

## Exact-package verification handoff

The [S10/S11 execution record](https://github.com/hongkian03/niche-out/blob/main/docs/implementation/evidence/E6-S10-S11.md) identifies the selected local tarball, exact available-Mac execution tuple, test outcomes and scoped readiness decision. Older reports remain historical and are not silently relabelled as tests of new bytes. Publishing is a separate S12 action requiring explicit approval.

## Current qualification limits

- One private npm tarball includes `darwin-arm64`, `darwin-x64`, `win32-x64` and `linux-x64` native helpers. Apple Silicon execution is recorded; Intel Mac, Windows 11 and Linux actual-machine validation remains owner-deferred. Cross-builds and a prepared, unexecuted CI matrix do not establish those platforms' compatibility. Earlier runtime-inclusive archives remain historical.
- No project-signed/notarized public release exists. Paid native payload authentication is optional. Exact-package installation, inventory/notice review, honest qualification and approved npm publication remain Epic 6 gates.
- The available machine is a MacBook Pro M3 Pro with 18 GiB RAM; results on it do not establish an 8 GiB reference-host guarantee. Simulated clients do not establish 100 physical-phone performance.
- Earlier user evidence covers iPhone Safari over cellular with the Mac on eduroam, QR join, keyboard behavior and completed gameplay. Current smartphone viewport tests are not additional physical iOS/Android keyboard or assistive-technology certification.
- Actual venue reliability, provider request headroom and cross-network behavior must be interpreted from the exact tested workload. The installed npm mixed run used 80 WebSocket and 20 polling players on eduroam; one polling DNS error recovered. It is not an all-polling or outage-free claim. Quick Tunnels are temporary, lack an uptime guarantee and have provider limits.
- Deferred physical sleep/wake, clock changes, quarantine/reputation and broader browser/OS versions remain follow-up evidence. A scoped initial release claims only the executed target/path; stronger compatibility/reliability claims wait for their measurements.

## Deliberate prototype limits

One active game per host, up to 100 admitted players, 1–20 prompts, 10 MiB maximum JSON, English prototype content, no in-app pack editor, no fuzzy matching/LLM answer judge, no player accounts, no history/export/restart recovery, no late newcomers after Start, no pause/skip/manual score adjustment and no rematch retaining players. Drafts clear on refresh; accepted answers survive same-origin reconnect. New public origin means a fresh session. Custom time settings remain in JSON; omitted durations are 3/25/10 seconds.

## Notice review — November 19, 2026

The source production graph plus esbuild generated-helper notice is covered by packaged permission files. The `abstract-logging@2.0.1` linked author-license service was retrieved successfully and its full rendered MIT permission text, served copyright/year and provenance snapshot were retained. `xmlhttprequest-ssl` includes complete MIT text; its absent upstream metadata label remains an informational finding.

All 70 distinct module versions linked by the four pinned cloudflared binaries, including replacement forks, were fetched with Go checksum verification and matched to the binary module inventory. The package preserves 111 module license/NOTICE/AUTHORS/PATENTS files plus the two notices for the recorded Go runtime version. Cloudflared executables remain separate explicit downloads. This completes the technical notice/provenance work; the final scoped S11 review is recorded in the S10/S11 handoff above. See the [notice report](https://github.com/hongkian03/niche-out/blob/main/docs/implementation/evidence/NOTICE-REVIEW.md).

For manual operating steps use the [operator guide](OPERATOR-GUIDE.md); for the required integrity boundary and optional signing actions use [SIGNING.md](SIGNING.md). Nothing was published.
