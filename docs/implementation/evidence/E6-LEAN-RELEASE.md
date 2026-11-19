# Epic 6 lean initial npm release revision

November 19, 2026. The owner requested a parallel review of Epic 6 to remove unnecessary pre-release requirements after moving to npm. Three agents reviewed the story/dependency graph, supporting product/release docs and executable gates. The coordinator integrated their findings and aligned the review-only planner/configuration. This is a policy/backlog revision, not publication or evidence that unexecuted checks passed.

## Revised required path

**Completed S06 → S10 final exact-package check → S11 scoped readiness review → S12 explicitly authorized publication and registry/install readback.**

The initial qualification target is the available Apple Silicon Mac, with the actual tested OS/Node tuple recorded. Intel Mac, Windows and Linux helper payloads may remain included, but their execution stays unverified/experimental until the owner supplies evidence. Intended OS floors and bundled native resources are not certification. Publication remains a separately approved action; one authorized initial release/readback is sufficient without a mandatory candidate/stable promotion ceremony.

Required: actual `.tgz` integrity and complete resource/source/native/connector/dependency bindings, reviewed notices and approved rights, correct npm account/name preflight, installed CLI/worker/native/setup/game smoke on the declared scope, usable player input/keyboard/mobile layout, no known release-blocking correctness/privacy/security/recovery issue, documented limitations and secure authenticated publication. Unchanged-runtime evidence may carry over with an explicit byte comparison; updated package metadata still needs a fresh source/artifact freeze at S10.

## Removed from the mandatory release path

| Previous gate | Revised treatment |
| --- | --- |
| S07 paid Mac Developer ID signing/notarization/stapling | Optional future enhancement; no certificate purchase/enrollment required for this scoped release |
| S08 Windows publisher certificate/timestamp pipeline | Optional future enhancement |
| S09 independent persistent signatures/native inventory authentication | Optional future enhancement; normal package hashes and source traceability stay required |
| All four authenticated target reports before any release | Qualify and honestly label the declared initial scope; owner-deferred targets remain unverified |
| New hosted trusted-publisher/OIDC system and registry provenance | Optional enhancement; secure authenticated manual publication is permitted after explicit approval |
| Mandatory candidate upload then separate stable promotion | Optional release-management choice; exact published-version readback/install verification remains required |
| 8 GiB reference hardware, 100 physical phones, venue guarantees, all-polling certification and exhaustive OS/browser/assistive-tech matrices | Deferred qualification with existing findings and limitations retained; essential usability/correctness/security fixes are still required |
| Fresh exhaustive stress/endurance campaign for unchanged code, pixel polish and information site | Evidence-driven follow-up/optional work; rerun affected checks for real changes or unresolved material failures |

S07–S09 retain their IDs and historical anchors as OPTIONAL TODO, not completed work. S02–S05 and networking N08 keep their dated REVIEW evidence; no failure was rewritten as a pass. Actual first-run OS blocking behavior would still require investigation before calling that platform usable. The existing Apple Silicon addon and guard were observed to have linker-generated ad-hoc signatures; these remain intact. No signatures or security controls were stripped.

## Executable policy alignment

`packaging/release/candidate.json` now records the lean scope and optional enhancements. The release planner no longer requires signing credentials, all-target signed reports, persistent signing infrastructure or hosted-publisher enrollment. `preparationReady`/CLI exit 0 means local artifact and metadata/notice/access preparation checks pass; exit 1 means real local preparation blockers, including a stale source snapshot. It still reports `publicReleaseReady: false` and `publicationAuthorized: false`; S10/S11 verification and S12 explicit approval remain separate required next checks. Metadata cannot manufacture final execution evidence or authorize uploads.

The planner has no publishing/signing/key-access mode. Tests cover unsigned local preparation readiness while preserving rejection of damaged packages, missing permission texts and unapproved rights. Generated package README/native-inventory wording now describes paid publisher signing as optional. No game/server/native behavior or binary changed.

## Files and verification

Story/dependency changes are in `docs/IMPLEMENTATION-PLAN.md` and `docs/implementation/epic-06-validation-release.md`. Supporting PRD/architecture/coverage, E5 migration references, release guides, owner decisions, requirement ledger and developer instructions are reconciled. Historical archive recipes and measured evidence remain explicitly dated.

Targeted tests and link/whitespace checks are recorded in [revision checks](epic6-npm-release/lean-revision-checks.json). The existing candidate was not rebuilt in this policy-revision turn; it predates these source/config/docs edits. S10 refreshes the candidate source freeze before its final audit and installed smoke. This report claims no fresh capacity, physical-device, other-platform, Gatekeeper, signature, notarization or registry-publication result.
