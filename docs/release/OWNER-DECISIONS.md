# Inputs for the npm release

Updated November 18, 2026, following the owner's explicit decisions during E6-S06. The npm candidate and local release tools are implemented. No package has been published, reserved or assigned to an npm account.

| Input | Current decision | Remaining action |
| --- | --- | --- |
| Product / package | **Niche Out** / **`niche-out`**, name approved by owner | Registry availability and account ownership remain unverified; an approved name is not a reservation |
| Source license / copyright | Existing **MIT**; **Copyright (c) 2026 Kian Hong Tan** | Reused from root LICENSE; no new license choice required |
| npm account or organization | **Deferred by owner** | Choose the login/organization that will manage the package; verify access before publishing |
| Release publisher | **Deferred by owner** | Confirm individual/company publishing identity; copyright does not imply certificate/account identity |
| Artwork / example rights | **Deferred by owner** | Confirm permission to distribute original artwork and curated example packs |
| Native signing | No project authentication completed | S07–S09 prepare and validate Mac/Windows/Linux native authentication using approved identities |
| Trusted publishing | Configuration pending | Choose approved repository/workflow/environment and separately pinned publisher tooling; keep credentials out of source/chat |
| Final platform/device checks | Owner will perform on their own schedule | Retain exact artifact identity and real-machine evidence for final release qualification |
| Publication | **Not authorized** | Review exact final tarball/version/integrity and explicitly authorize candidate upload and eventual promotion |

An npm account manages ownership and publication of a package. A personal account is sufficient to own an unscoped package; an organization can manage team access. This decision can wait while local tarball development continues. Do not send passwords, access tokens, private keys or keychain exports.

`packaging/release/candidate.json` records these decisions in npm schema 2. `release-plan` exposes deferred inputs and later signing/qualification gates without invoking them. There is no requirement to create an account or upload a package to audit a local candidate.
