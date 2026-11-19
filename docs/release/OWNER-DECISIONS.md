# Inputs for the planned npm release

The [Epic 5 npm migration](../implementation/epic-05-npm-distribution.md) is the active plan. This document records inputs, not an existing npm package or authorization to publish. Portable archives remain historical private builds.

The root [MIT license](../../LICENSE) already states Copyright (c) 2026 Kian Hong Tan. Reuse it in release metadata; do not ask the owner to choose again. Product name **Niche Out** and candidate version **0.1.0** follow the project. The exact npm package/namespace, availability, account access and final release version require verification.

| Input | Required value/evidence | Boundary |
| --- | --- | --- |
| Source license | Existing MIT license and copyright | Already present; reconcile legacy null candidate metadata during implementation. |
| npm identity/access | Approved name/scope, account/organization, maintainers and repository association | Suggested names are not reserved. No registry package/account was created. |
| Publisher identity | Exact individual/company identity for release/native authentication | Copyright alone does not establish certificate/key identity. |
| Art/examples | Confirm rights and licenses for original art and curated examples | Font/connector/dependency notices are separate. |
| macOS native authentication | Approved Developer ID/Team ID and applicable notarization credentials/profile | Earlier inventory found no project signing identity. npm provenance does not supply one; old standalone `.app` work is superseded. |
| Windows native authentication | Approved certificate/service, selector and timestamp endpoint for x64 helper | The old bundled-Node/JS verifier is superseded; native authentication remains required. |
| Linux/release inventory | Approved persistent signing key and independently published fingerprint | Ephemeral private-test keys do not establish publisher identity. |
| Trusted publication | Approved CI repository/workflow/environment, permissions and separately pinned publisher toolchain | Keep publish/promotion rights explicit; no credential in source/package/logs. |
| Target execution | Four targets with supported user-installed Node | Cross-build/source tests do not prove clean npm-install behavior; deferred real-machine evidence remains. |
| Venue/browser qualification | Actual event network, physical phones and assistive-technology tests | npm does not close game/network qualification gaps. |
| Publication approval | Exact reviewed version/tarball integrity, native inventory, evidence and channel | Candidate upload and stable promotion remain separately authorized. |

`packaging/release/candidate.json` and release tools currently retain legacy archive schemas. Migration is planned code work, not completed by these documentation changes. Credentials alone cannot certify missing native authenticity, tests or notices. Never send private keys/passwords/tokens/keychain exports in chat or place them in source.

No purchase, account enrollment, key generation, certificate import, notary upload, npm publication or stable promotion occurred.
