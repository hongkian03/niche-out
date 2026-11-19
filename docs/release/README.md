# Niche Out release preparation

> **Active distribution plan:** [E5-N01–N06](../implementation/epic-05-npm-distribution.md) migrate future delivery fully to npm. Existing release scripts still inspect legacy portable artifacts and must be rewritten under revised E6-S06; they are not npm-readiness checks today. No npm package is implemented or published by the plan. The [signing plan](SIGNING.md) defines npm/native trust and separately authorized publication.

This directory records **private candidate preparation**, not a published or publisher-signed release. Epic 6 does not silently waive the promised public signing or target checks. The owner explicitly deferred non-Mac compatibility testing until after this epic; those results remain required before those targets can be advertised as verified.

- [Operator guide](OPERATOR-GUIDE.md): launch, public joining, recovery, diagnostics and manual updates.
- [Signing and distribution](SIGNING.md): current trust boundary, concrete platform work and final validation.
- [Owner decisions](OWNER-DECISIONS.md): the decisions and credentials that cannot be inferred.
- [Candidate notes and known limits](RELEASE-NOTES.md): product behavior, remaining defects and qualification limits.
- [Requirement evidence](REQUIREMENT-EVIDENCE.md): each of the 28 PRD criteria, 35 UI criteria and 26 architecture obligations, with evidence boundaries.
- [Epic 6 release evidence](../implementation/evidence/EPIC-6-RELEASE.md): exact checks performed and findings.

Run these from the repository with the pinned Node 24.22.3 toolchain:

```sh
node --test tests/release/release.check.mjs
node scripts/release-audit.mjs
node scripts/release-connector-inventory.mjs
node scripts/release-plan.mjs
```

`release-audit` writes `work/release/audit.json`. Exit 0 means its limited checksum/staging-notice checks passed, **not** that redistribution or publisher authenticity passed. It inventories 105 production dependency paths as currently locked, retains missing-notice findings and always reports `publicReleaseReady: false`. Re-run it after rebuilding final archives.

`release-connector-inventory` uses Go’s read-only binary metadata reader to inventory the four pinned connector payloads and their replacement modules. It writes `work/release/cloudflared-modules.json`; module discovery is not completed license clearance.

`release-plan` prints the missing decisions, engineering prerequisites and target evidence from `packaging/release/candidate.json`; exit 1 is intentional while this is a preparation-only planner. It cannot sign, notarize, publish or read private keys. Filling configuration fields does not fabricate completion. Release execution requires the remaining platform implementations documented in SIGNING.md.

Private candidate assembly remains in the existing `package:download`, `package:toolchain`, `build:platform` and `package:build` recipes. Keep all four outputs tied to one `build/manifest.json`. The release inventory does not extract archives or replace the existing portable-resource/tamper tests. A manifest identifies the last build, not subsequent working-tree edits.
