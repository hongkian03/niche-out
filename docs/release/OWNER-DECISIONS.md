# Inputs for the npm release

The November 19 lean-release policy makes paid native signing and exhaustive platform qualification optional/deferred for the initial scoped npm release; see [release policy](SIGNING.md).

Updated November 19, 2026, following the owner's explicit decisions during E6-S06. The npm release tools are implemented. Story 12 published and verified `niche-out@0.1.0` under personal account `hongkian03`; see the [publication record](../implementation/evidence/E6-S12.md).

| Input | Current decision | Remaining action |
| --- | --- | --- |
| Product / package | **Niche Out** / **`niche-out`**, name approved by owner | Initial preflight returned 404; publication/readback now confirm `niche-out@0.1.0`. Recheck access and unused version for future releases |
| Source license / copyright | Existing **MIT**; **Copyright (c) 2026 Kian Hong Tan** | Reused from root LICENSE; no new license choice required |
| npm account or organization | **Personal account `hongkian03`**, confirmed by owner November 19 | Public registry metadata verifies `hongkian03` as publisher and maintainer of the published package |
| Release publisher | **Kian Hong Tan**, display name approved November 19 | Optional native publisher identities are needed only if later signing enhancements are chosen |
| Artwork / example rights | **Approved November 19** for original SVG/CSS and authored example packs, including Singapore, under MIT | Third-party materials retain their own licenses |
| Native signing | **Optional future enhancement**, not required for scoped first npm release | No Apple/Windows certificate purchase or signing enrollment is needed now; preserve OS-required/ad-hoc signatures |
| Trusted publishing | Recommended optional automation | Secure authenticated manual npm publishing is acceptable; if CI publishing is chosen, configure its provenance/permissions explicitly |
| Final platform/device checks | Owner will perform on their own schedule | Retain exact artifact identity; mark Intel/Windows/Linux unverified/experimental until executed. They do not block a scoped Mac-qualified release |
| Publication | **Authorized and completed for `0.1.0`** | Exact reviewed bytes published and independently verified; future releases require their own reviewed version and authorization |

An npm account manages ownership and publication of a package. A personal account is sufficient to own an unscoped package; an organization can manage team access. The owner selected personal account `hongkian03`; no organization is selected. Do not send passwords, access tokens, private keys or keychain exports.

`packaging/release/candidate.json` records these decisions in npm schema 2. `release-plan` exposes required local preparation and scoped S10/S11/S12 checks without invoking them. Paid signing and hosted-publisher/provenance follow-ups remain optional. There is no requirement to create an account or upload a package to audit a local candidate.

## Account/name preflight — November 19

Read-only requests to the official registry returned HTTP 404 for `niche-out`, and `npm whoami` authenticated as `hongkian03`. The [sanitized check record](../implementation/evidence/epic6-npm-release/npm-access-2026-11-19.json) contains no credentials. This completes the current pre-publication access check. It does not reserve the name, prove registry acceptance of a future publish, or authorize publication. `packageOwnershipVerified` remains false because no package exists yet; the planner accepts the separate new-package preflight rather than requiring an already-published package before S12.

## Original-material approval — November 19

The owner explicitly approved MIT distribution of original SVG/CSS artwork and authored example packs, including Singapore. The graphics are inline SVG/CSS in `apps/web/src/components.tsx` and `styles.css`; VT323 is the separate third-party OFL font. Example source citations and editorial rarity limitations are retained. This approval covers our original material, without assigning third-party font, reference-site or name rights to the project.

## Publication completion — November 19

The owner explicitly requested Story 12 and completed npm browser authentication. The exact reviewed `0.1.0` tarball was published, independently downloaded, integrity-checked and clean-installed by public name/version. S12 records the current outcome; `packaging/release/candidate.json` and S10/S11 evidence remain the historical prepublication snapshot rather than being rewritten after the fact. No second version or repository push was performed.
