# npm authenticity and final distribution plan

The [Epic 5 npm migration](../implementation/epic-05-npm-distribution.md) is the active plan. **No npm release, migrated signing pipeline or publication has occurred.** The portable signing design below is historical context; its standalone-container requirements are superseded by this section.

## Active trust boundary

The public CLI contains compiled JS/browser assets and four small native prebuilds. Hosts install Node `>=24.22.3 <25`. Connector acquisition uses explicit preparation/Start into a user-writable verified cache, not install hooks. npm registry/tarball integrity and provenance authenticate the distribution path; they do not establish immutable installed JavaScript, certify safety or replace native OS signing/notarization. User-installed Node and owner-writable package/cache locations are explicit parts of this operating model.

Retain project authentication for native payloads: both macOS variants require applicable Developer ID/notarization work and clean native-loading tests; the Windows x64 helper requires publisher signing/timestamp verification; Linux/native release checksums require an approved persistent publisher signature. Verify pinned upstream cloudflared before execution. Its vendor signature does not authenticate Niche Out JS, and arbitrary locally modified connector bytes must not be accepted.

The old standalone `.app`/Windows verifier sealing bundled Node and adjacent JS is replaced with npm installation integrity plus verified native/connector payloads. This plan makes no installed-JS tamper-resistance claim against a compromised owner-writable installation. Controlled tests still reject corrupt or missing native/cache payloads; no integrity bypass is added for a passing result.

## Planned release sequence

1. Freeze source/lock, package identity/version, native build inputs, connector pins and notices. Reuse the existing MIT root license/copyright; confirm publisher/package access and asset rights separately.
2. Build/test native helpers for `darwin-arm64`, `darwin-x64`, `win32-x64`, `linux-x64`; preserve clock, idle-power and process ownership. Do not bundle Node or require end-user compilation.
3. Apply approved native publisher authentication. Validate a suitable macOS notarization submission/delivery method for the actual npm-installed Mach-O assets; an npm `.tgz` is not automatically a stapleable `.app`. Verify Windows signing/timestamps and Linux/native-inventory signatures as applicable.
4. Generate final native/resource hashes after signing changes bytes. Record source/build identity and final payload hashes separately from upstream connector archive/executable pins. Do not mutate signed inputs afterward.
5. Pack outside the monorepo and test exact tarball bytes through clean global/local/npx installs with scripts disabled, spaces/Unicode paths, cold/warm caches and each target/runtime. Cross-compilation does not supply actual-machine execution evidence.
6. E6-S06 now supplies npm `release-audit`, review-only `release-plan`, schema-2 metadata and tarball failure-path tests. Use their exact candidate/resource/source/native hashes when preparing final authenticated bytes. Actual signing/publisher execution remains S07–S12; populated configuration cannot fabricate readiness.
7. Configure approved npm namespace/account and trusted CI publishing. Prefer a compatible hosted workflow with provenance, separately pinned release tooling and explicit publish/promotion permissions. Keep credentials outside source/packages/logs. [Trusted publishing](https://docs.npmjs.com/trusted-publishers/) · [Provenance](https://docs.npmjs.com/generating-provenance-statements/)
8. Registry provenance/signature verification occurs after publication; do not require published attestations to pass local pre-publication gates. A candidate tag is public distribution. Publish only the separately authorized candidate tarball; read back integrity/version/attestations and install it for final validation. Stable promotion is another explicit reviewed action. `npm audit signatures` verifies registry signatures/attestations, not OS-native trust. [Signature verification](https://docs.npmjs.com/cli/v11/commands/npm-audit/#audit-signatures)
9. Update only between hosting sessions. No background updater changes package/cache bytes while running. Published versions are immutable; changed contents need another version. Any future multi-package split must verify all exact-version dependencies before main promotion rather than assume atomic publication.

Host Node compatibility and release-CI Node/npm are separate pins. Official npm trusted-publishing/dist-tag operations have different minimum CLI versions and permissions; validate the selected publisher toolchain rather than assume the development npm pin supports every action. No enrollment, payment, key generation/import, notarization or publication is authorized by this plan.

## Historical portable-artifact design

The following records the earlier runtime-inclusive archive design. It explains existing private artifacts without reinstating standalone `.app`, Windows EXE, bundled runtime or no-setup-download requirements for npm.


## What exists today

All four portable artifacts are **private test builds**. Their SHA-256 sidecars detect accidental archive changes. The manifest uses a new ephemeral Ed25519 key for each build, with its public key embedded in the JavaScript bootstrap. The verifier detects covered-file changes against that bootstrap, but an attacker could replace both bootstrap and key. Neither the `.command`/`.cmd` launcher nor this bootstrap establishes project publisher identity. Upstream runtime/connector signatures, where present, do not authenticate Niche Out code.

`release-audit.mjs` reads checksums, manifests and notices; `release-plan.mjs` exposes unresolved decisions and prerequisites. Neither is a signing pipeline. No project certificate or persistent signing key was used, and no artifact was notarized, stapled or publicly uploaded in this task.

## Fixed order for the public pipeline

1. Freeze approved source, lockfile, Node and connector manifests and owner license/identity. Build/test all four target inputs. Copy output into isolated signing staging directories.
2. Complete the platform's authenticated bootstrap/container below. Ensure verification executes **before** any mutable Node/JavaScript/helper/connector code.
3. Sign native executables where applicable. Signing changes bytes: calculate final resource hashes only after these native signatures exist. Retain the verified upstream input hash separately from the final publisher-signed payload hash.
4. Create the final authenticated resource inventory, including JS, browser assets, native adapter, connector, runtime, launch configuration and notices. Resolve the existing connector check, which expects its original upstream executable hash. It must accept the exact approved final signed digest from an authenticated record, not disable verification.
5. Sign the outer launcher/container, then notarize/staple where applicable. Finalize the archive and only then produce its final checksum and detached signatures. Do not mutate signed content afterward.
6. Verify original/modified resources and clean-target launch; bind every report to final archive SHA-256 and source digest. Do not inherit private pre-sign tests blindly: repeat changed bootstrap, power adapter, asset loading, import, tunnel and shutdown behavior.
7. Review the per-criterion evidence and request publication only for a concrete qualified artifact set. No script here uploads release files.

## macOS arm64 and x64

Remaining implementation: a suitable project-authenticated `.app` with native launcher and sealed resources, or another approved signed distribution container that provides the equivalent startup trust chain. Preserve the visible launcher and browser-based management model. A loose `.tar.gz` cannot itself receive a stapled notarization ticket; a signed/notarized app inside an archive or a suitable DMG/package supplies the ticket-bearing artifact.

Sign nested Mach-O code first: bundled Node, `niche-platform.node`, `niche-guard`, cloudflared and the native project launcher, then the outer bundle. Use explicit code paths and verify each; do not use recursive `--deep` signing as a substitute for designing the layout. Test Node/V8 hardened-runtime needs and native-module loading on both CPUs. Keep entitlements minimal; do not ship `get-task-allow`, and do not casually disable library validation. Apple requires valid Developer ID signatures, hardened runtime and secure timestamps for applicable new software. See [Apple's notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

The final manual/CI sequence, once the implementation and credential profile exist, is:

```sh
# Read-only identity discovery; never export a private key.
security find-identity -v -p codesigning
# Apply explicit inside-out codesign commands from the finalized app layout.
# Then inspect the outer app; these paths are future finalized artifacts.
codesign --verify --deep --strict --verbose=2 'Niche Out.app'
xcrun notarytool submit 'Niche-Out-mac.zip' --keychain-profile "$NICHE_NOTARY_PROFILE" --wait
xcrun stapler staple 'Niche Out.app'
xcrun stapler validate 'Niche Out.app'
spctl --assess --type execute --verbose=4 'Niche Out.app'
```

These are instructions, **not commands executed during Epic 6**. Read the notary log, including warnings. Re-archive the stapled app and regenerate its checksum. Test download quarantine and offline ticket validation on a clean target while treating internet-dependent hosting separately. Record arm64 and Intel results independently.

## Windows x64

Remaining implementation: a native publisher-signed launcher/resource verifier. Its signed image must hold the trusted manifest key or equivalent trusted manifest digest and verify bundled Node, all JS, the connector and native resources **before** loading them. A signed Node runtime executing arbitrary adjacent JS is insufficient. Signing a shell script or relying on the existing editable bootstrap does not fix that gap.

After the native trust chain exists, sign and RFC3161 timestamp the final launcher using the owner's approved certificate/service, explicit SHA-256 file and timestamp digests, and an approved HTTPS timestamp endpoint. Verify through SignTool's default authentication policy and test a controlled modification to JS, connector, native addon and manifest/bootstrap. The modified covered input must fail before Node or the connector launches. See [Microsoft SignTool](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool).

```text
signtool sign /sha1 <certificate-selector> /fd SHA256 /tr <approved-https-url> /td SHA256 NicheOut.exe
signtool verify /pa /all /v NicheOut.exe
```

Do not put certificate passwords in command arguments or artifacts. The exact certificate provider/HSM workflow depends on the selected publisher. Preserve extract-and-launch portability, verify on a clean Windows 11 machine without Node/developer tools and record SmartScreen behavior without promising that reputation warnings disappear.

## Linux x64

The selected policy is a detached publisher signature over the completed tar archive, not a new runtime verifier. Once a persistent owner-approved OpenPGP key exists, sign the exact final archive and publish the verification key/fingerprint by an independently trusted channel. Example workflow:

```sh
gpg --armor --detach-sign --local-user "$NICHE_RELEASE_FINGERPRINT" Niche-Out-linux-x64.tar.gz
gpg --verify Niche-Out-linux-x64.tar.gz.asc Niche-Out-linux-x64.tar.gz
```

The fingerprint must match the approved publisher; a checksum from the same untrusted download alone does not provide authenticity. Test signature success for the original and failure for a byte-modified copy. Confirm extraction permissions and managed hosting on Ubuntu 24.04+ x64. No release key was generated and no detached publisher signature exists yet.

## Release evidence to retain

Store public certificate subject/Team ID/fingerprint, tool versions, sanitized sign/verify results, notarization request/status/log (no credentials), ticket validation, final archive size/SHA-256, runtime/connector source+final hashes, notice inventory and clean-target report. Retain tamper failures and no-child-process-before-verification evidence. Private signing keys, passwords, tokens, keychain exports and provider credentials never belong in the repository, archive or report.
