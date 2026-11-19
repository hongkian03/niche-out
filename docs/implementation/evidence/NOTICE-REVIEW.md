# S06 notice and original-material review

November 19, 2026. The owner explicitly approved MIT distribution of original project SVG/CSS artwork and authored example packs, including Singapore. npm account `hongkian03`, publisher display name `Kian Hong Tan`, intended name `niche-out`, and the recorded new-package access preflight are already settled. S06 is complete after this notice follow-up; no signing or publication occurs here.

## Artwork and examples

The ocean, submarine, bubbles and seabed are inline SVG/CSS in `apps/web/src/components.tsx` and `styles.css`; the only source asset file is the VT323 font, with its separately preserved OFL notice. The authored examples include cited factual Singapore answer sets and editorial tier estimates. Source citations and their scope/accuracy qualifications remain in the examples. Owner approval covers project-original material under MIT and leaves third-party font/reference/name rights with their respective holders.

## abstract-logging

The installed `abstract-logging@2.0.1` README links to the author's MIT-license service. Browser retrieval had failed in earlier reviews. Direct HTTPS retrieval succeeded on November 19. The article's complete permission text was rendered to plain text, retaining the copyright/year exactly as served (2026, not an invented historical release year). Public email obfuscation was decoded as the page itself does. The original HTML snapshot is retained under `packaging/notices/abstract-logging-license-page.html.txt`; `scripts/notices/abstract-logging-2.0.1-source.json` records URL, retrieval date and HTML/text/installed-README hashes. The packaged supplemental text is verified against those hashes and the installed README before use. No upstream package source or metadata was modified.

Source: [author's linked license service](https://jsumners.mit-license.org/). The service's [upstream author configuration](https://github.com/remy/mit-license/blob/master/users/jsumners.json) corroborates the named author. The notice is an archived rendering of the package's linked license, not an independent relicensing statement.

## cloudflared

The existing Go build-info inventory binds to the pinned hashes of all four cloudflared executables. There are 70 distinct linked module/version pairs across targets, including exact replacement forks. The explicit maintainer script `scripts/release-vendor-notices.mjs` downloads those sources through the Go module proxy/checksum database into `work/notice-review/`, compares every module sum to the binary inventory, and collects permission/attribution candidates. It never executes a connector, edits runtime caches or runs during npm installation/application startup.

All 70 module sums matched. The source inventory contains 111 license/NOTICE/AUTHORS/PATENTS files, including mixed-license bundled attributions. The observed evidence includes MIT, BSD and Apache-2.0 texts; complete files are retained rather than replacing mixed notices with guessed SPDX labels. The recorded build runtime is `go1.27.4`; its exact tagged LICENSE and PATENTS files were also retrieved. `packaging/notices/cloudflared/inventory.json` maps each module, original/replacement path, version, checksum, target and copied-file digest. Runtime source: [Go go1.27.4](https://github.com/golang/go/tree/go1.27.4).

Npm assembly verifies the static reviewed data and copies it under `release/notices/cloudflared/`. The auditor independently checks module coverage, replacement sums, runtime version and actual tarball notice-file hashes. The source collector is a maintainer investigation, not a host dependency. The cloudflared executable itself is still downloaded unchanged only after explicit prepare/Start; it is not in the npm tarball. This is technical notice/provenance completion, not a claim of independent legal certification or final release authentication.

## Integration and verification

`release-notice-review.mjs` supplies the verified supplemental data to `release-notices.mjs`; `release-audit.mjs` validates the actual packed notices. Missing/corrupt/stale files, wrong forks/sums/runtime or incomplete inventories fail verification. The `xmlhttprequest-ssl` upstream license-label omission remains informational because its complete MIT text is already preserved.

The [verification summary](epic6-npm-release/notice-review-2026-11-19.json) records tests, exact final candidate identity and audit results. Generated evidence is excluded from its own build-source digest. Earlier artifacts/reports are historical and are not overwritten as passing measurements of new bytes. S07–S12 still own native authentication, final clean-target validation and explicitly authorized publication.
