# Decisions required before public release

The product name **Niche Out** and candidate version **0.1.0** follow the existing project. No open-source license, legal publisher, certificate identity, public destination or account has been chosen on the owner's behalf. Record approved values in `packaging/release/candidate.json` and keep actual private credentials outside the repository.

| Decision/input | Concrete proposal or required input | Why it is still open |
| --- | --- | --- |
| Project source license | Choose an SPDX license and copyright holder; add the complete approved root LICENSE | The request to open source the project does not specify license terms. Third-party MIT/Apache/OFL licenses do not license project-owned code. |
| Publisher identity | Exact individual/company publisher and copyright notice | Must match the chosen public signing identity and project attribution. |
| Original assets/examples | Confirm rights to ship project art and curated examples; state their license | Current assets claim project originality; owner rights/license approval is not recorded. |
| macOS | Developer ID Application identity, Team ID, notarization credentials stored in a local keychain profile | Read-only identity inventory on November 16 found **0 valid code-signing identities**. No key was requested or exported. |
| Windows | Approved code-signing certificate/service, certificate selector and HTTPS timestamp endpoint | No publisher identity or Windows signing environment is configured. Never send a private key in chat. |
| Linux | Persistent OpenPGP signing key and independently published full fingerprint | Per-build ephemeral test keys are not stable publisher identity. No persistent release key has been created. |
| Distribution destination | Approved source/release repository and public release authorization | No destination is assumed and no upload is authorized by preparation alone. |
| Deferred compatibility | Execute clean Mac Intel/Windows/Linux tests after Epic 6, as requested; also validate final signed Mac Apple Silicon output | Cross-compilation/assembly is not execution evidence. Results must identify final artifact hashes. |
| Venue/browser qualification | Actual event uplink, current/previous Safari, Android Chrome, and assistive-technology/physical-keyboard checks | Desktop emulation and the earlier single iPhone/eduroam+cellular success are bounded evidence. |

These inputs are only part of the remaining work. Platform launcher/container engineering, signing-time digest updates, complete notices and final tamper tests must be completed before credentials can yield a valid public release. Supplying certificates alone will not make the current private archives publisher-authenticated.

No payment, account enrollment, key generation, certificate import, notarization upload or publication was performed. Follow the signing guide after the implementation prerequisites are satisfied; do not weaken signature checks to avoid the missing inputs.
