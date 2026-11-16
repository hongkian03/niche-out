# Epic 6 release preparation and evidence

Recorded November 16, 2026. This report covers the authorized preparation for E6-S06–S11. It does **not** assert completion of project signing, notarization, public distribution or the final G6 release gate. The user explicitly deferred non-Mac compatibility execution until after Epic 6. Story statuses remain in the [master backlog](../../IMPLEMENTATION-PLAN.md#story-tracker).

## What was implemented

- `packaging/release/candidate.json`: reviewable product/version metadata, unchosen owner license/publisher fields, named signing references, explicit implementation prerequisites, and null per-target final evidence. No credentials or private keys.
- `scripts/release-audit.mjs`: repeatable local artifact checksum/staging-notice audit and production dependency inventory, bound to the current build manifest and pinned runtime/connector versions. It writes `work/release/audit.json`. It distinguishes separately staged resources from actual archive extraction and always reports public readiness as false.
- `scripts/release-connector-inventory.mjs`: verifies the four pinned connector executable hashes, then reads their Go build metadata without executing them. Retains exact dependency versions/checksums and replacement forks. Go is a maintainer inspection dependency only; it is not added to the product runtime.
- `scripts/release-plan.mjs`: validates candidate metadata and reports missing identity/notice/native implementation/final evidence inputs. It is an intentionally **review-only planner**, not an executed signing pipeline. Unsupported execution flags fail closed. It never launches external signing tools, reads keys or uploads artifacts.
- `tests/release/release.check.mjs`: six meaningful checks for checksum filename binding; missing-owner/trust-chain gates; populated metadata failing to certify completion; malformed/execute requests; Go replacement attribution; and a temporary four-artifact fixture that detects altered archive bytes, stale source identity and missing notices.
- `docs/release/`: operator/setup/recovery/update guide, concrete signing sequence and outstanding engineering, owner decisions, candidate notes/limits and an individual 28 PRD +35 UI +26 architecture evidence matrix.

These are preparation tools and documentation, not changes to gameplay scoring or the established private package launcher. The coordinator's final archive-extraction verifier independently checks actual extracted resources; this report's audit deliberately does not claim that a matching staging directory proves archive contents.

## Checks performed and results

| Check | Actual result | What it proves / does not prove |
| --- | --- | --- |
| `node --test tests/release/release.check.mjs` under Node 24.22.3 | **6/6 passed** | Preparation guards and controlled audit failure paths work. Not a signature validation test. |
| `node scripts/release-audit.mjs` against the existing E5 private outputs | **Four archive checksums matched**; source/runtime/connector staging bindings and four required notice paths passed | Baseline bytes correspond to their sidecars and staged manifests. These are pre-final-refresh artifacts. |
| Production dependency inventory | **105 paths inspected** | License/notice file presence and metadata recorded; not a complete legal clearance. Two concrete exceptions below. |
| `npm audit --omit=dev --json --ignore-scripts --audit-level=low` | **0 known production advisories reported**, successful registry response | Advisory database snapshot only; not proof of absence of vulnerabilities or a source security audit. No dependency changes. |
| `node scripts/release-connector-inventory.mjs` | **Four input hashes matched**; **66** linked modules for each Mac/Windows binary and **67** for Linux | Exact built connector dependency/replacement inventory, not completion of all transitive notice texts. |
| `security find-identity -v -p codesigning` | **0 valid identities found** | Read-only discovery; no key export, import, creation or signing occurred. |
| Signing/packaging design inspection | Trust-chain gaps found below | Prevents mistaking private test signatures or vendor runtime signatures for publisher authentication. |
| Primary documentation review | Apple notarization, Microsoft SignTool, Cloudflare Quick Tunnel documentation checked | Current workflow/provider limits reflected in operator/signing guides; no provider guarantee inferred. |
| Actual project signing/notarization/stapling | **Not performed** | Required identities and engineering prerequisites are absent. |
| Public release upload | **Not performed** | Separate authorization and qualified final artifacts are still required. |

Reproduce the preparation checks from the project root:

```sh
node --test tests/release/release.check.mjs
node scripts/release-audit.mjs
node scripts/release-connector-inventory.mjs
node scripts/release-plan.mjs
```

The last command intentionally exits 1: preparation-only tooling cannot certify public readiness. Other commands exit nonzero on their measured integrity/setup failures. The connector inventory requires an installed Go inspection tool, not credentials or network access.

The retained [initial inventory](epic6-release/initial-private-inventory.json) binds to the earlier E5 archive hashes and is labelled initial, not final. The [connector module inventory](epic6-release/cloudflared-modules.json) binds to exact pinned binaries. Final refreshed hashes, extraction checks, current source regression and Mac portable smoke belong to the coordinator's final Epic 6 report. A source digest is the build snapshot identity; it does not represent later documentation/code edits until rebuilt.

The coordinator subsequently rebuilt all four private archives. The [final inventory](epic6-release/final-private-inventory.json), [actual extracted-file verification](epic6-release/final-assembly-verification.json) and [Mac launch/game/recovery record](epic6-release/mac-verification.json) bind to those refreshed hashes. Every archive passed checksum/private test signature/resource inventory checks; the Mac shell launcher and real-tunnel browser game passed. Other platforms were extracted and inspected, not executed. These final private checks still do not establish publisher signing or clean-machine distribution.

The [production advisory response](epic6-release/npm-audit-production.json) was captured by the coordinator under the pinned runtime on November 16. The subagent's first sandboxed registry request failed DNS resolution; the coordinator's authorized network execution succeeded. This was a tooling-access limitation, not evidence that the game's tunnel or the npm registry was unavailable. No `audit fix`, installation, lockfile change or version upgrade was performed.

## What went right

All four original private archives had matching SHA-256 sidecars and consistent pinned Node 24.22.3/cloudflared 2026.11.0 metadata. Required Node, connector and font/art notices existed in the staged inventories. All new preparation tests passed on first execution; the expanded artifact fixture passed after it was added. Controlled bad-input cases failed in the intended audit/planner paths without invoking signing or publication.

Existing package assembly already copies production dependency directories and their license files. The Go binary metadata was readable for all four targets from the available Mac without executing another platform's binary. Replacement dependencies were retained rather than incorrectly crediting only their original upstream module names.

## Problems found, changes made and remaining work

| Finding | Action taken now | Remaining / severity |
| --- | --- | --- |
| Private Ed25519 manifest uses a per-build key embedded in editable JS | Explicitly documented threat boundary and kept public-ready false in all new tooling | **Public-release blocker:** authenticate the project launcher/bootstrap and manifest chain. Checksums alone do not solve this. |
| Windows `.cmd` starts Node before an authenticated project verifier exists | Added native launcher/resource verifier prerequisite and before-execution tamper criteria | **Code still to build:** publisher-signed native launcher, trusted manifest key/digest and covered Node/JS/native/connector verification. Requires Windows execution later. |
| Mac loose tar has no staplable outer app/container | Prepared inside-out signing/container/notarization sequence and native-launcher requirement | **Code/layout still to build:** suitable app/container, hardened-runtime entitlement testing and both CPU clean-target verification. |
| Native signing changes bytes checked by portable and connector manifests | Added ordering requirement and separate upstream input vs final signed payload digest | **Code still to build:** signing-time final manifest/authentication pipeline; never disable connector checks to make a signed binary run. |
| No available Developer ID code-signing identity | Read-only inventory recorded | **Owner input:** credentials/keychain setup after native implementation; no bypass suggested. |
| `abstract-logging@2.0.1` lacks standalone complete permission text | Recorded installed README/source evidence and attempted authoritative MIT service lookup | **Notice completion required:** service unreachable; do not invent a copyright year/text from another package. |
| `xmlhttprequest-ssl` lock metadata lacks license identifier | Inspected installed LICENSE, which contains complete MIT permission text | Metadata warning only; no claim that the shipped license text is missing. |
| cloudflared's own Apache license does not inventory every linked Go notice | Extracted exact target module lists and replacement forks | **Notice review remains:** collect/review corresponding upstream module copyright/license/NOTICE materials. |
| Project license/publisher/asset rights not approved | Prepared concrete owner decision sheet with null configuration fields | **Owner decision:** choose project license/holder, approve rights and eventual distribution identity. No license chosen on owner's behalf. |
| Clean other-platform execution absent | Preserved explicit owner deferral and per-target null evidence | Required later before advertising compatibility or public qualification. Compilation is not execution. |

The abstract-logging check followed its installed README to `jsumners.mit-license.org`; both browser lookup and direct DNS retrieval failed. The [upstream README](https://github.com/jsumners/abstract-logging/blob/master/Readme.md) also only links that service, and the service's [author metadata](https://github.com/remy/mit-license/blob/master/users/jsumners.json) confirms James Sumners but does not provide version-bound complete permission text. The unresolved finding is intentional and visible.

No product bug was hidden by marking preparation as signing success. The issues in this section do not prevent current private gameplay, but the authenticity, notice and supported-target requirements are mandatory before a promised public release. Owner credentials are only one part; engineering work remains independent of those credentials.

## Owner follow-up after Epic 6

1. Choose the project source license and exact publisher/copyright holder, and approve original art/example distribution rights. Keep actual signing secrets out of chat and the repository.
2. Decide which publisher signing identities to provision: Mac Developer ID/notarization keychain profile, Windows certificate/service with approved timestamping, and persistent Linux OpenPGP key/fingerprint. No purchases/enrollment were performed.
3. Run the deferred target tests when ready, **after** final platform signing work produces candidates: Intel Mac, Windows 11 x64, Ubuntu 24.04+ x64; repeat signed Mac Apple Silicon. Record final artifact hash, actual OS/CPU, signature/tamper, extract/launch/no-download, managed public game, recovery and cleanup results.
4. Supply the actual venue/browser/assistive-technology checks left by the load/UI reports. Do not treat emulation as physical keyboard/VoiceOver evidence.
5. Review a final concrete artifact inventory before separately authorizing publication to the chosen destination. No optional marketing site is required for gameplay/private handoff.

The [signing guide](../../release/SIGNING.md) separates implementation tasks, credential inputs and commands; the [operator guide](../../release/OPERATOR-GUIDE.md) is ready for the current private prototype workflow. Formal E6-S06/S11 completion waits for their owner/evidence conditions; S07–S10 cannot be called done based on this preparation alone.
