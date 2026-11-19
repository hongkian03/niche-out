# Niche Out release preparation

E6-S06 implements local **npm** release preparation. The source workspace stays private; `npm run package:npm` assembles one compiled CLI tarball, four small native helper targets, examples, notices and source provenance. Hosts supply supported Node. The connector is obtained on explicit prepare/Start into a verified user cache. Neither Node nor cloudflared executables are bundled in the npm package.

This is an unpublished private candidate. Native authentication, actual deferred-platform qualification and publication remain separate gates. Epic 5 was closed by the owner with manual testing deferred; it does not certify unexecuted targets.

- [Operator guide](OPERATOR-GUIDE.md): installation, hosting, QR joining, recovery and updates.
- [Owner inputs](OWNER-DECISIONS.md): approved package name and deferred account/publisher/rights decisions.
- [Signing plan](SIGNING.md): native authentication and separately authorized npm distribution.
- [Known limits](RELEASE-NOTES.md) and [requirement evidence](REQUIREMENT-EVIDENCE.md).
- [S06 implementation/test report](../implementation/evidence/E6-S06-NPM.md).

From the source checkout, using contributor Node 24.22.3/npm 11.19.1 and the existing native inputs:

```sh
npm run package:npm
npm run test:release
npm run release:audit
npm run release:plan
```

`release:audit` reads the actual adjacent `.tgz` named by `dist-npm/candidate.json`; it never trusts a matching staging tree as proof of tarball contents. It checks SHA-256/npm integrity, tar paths/types, every resource, file modes, worker/browser/native entries, dependency/shrinkwrap pins, license/notices and the packaged source snapshot. It writes `work/release/npm-audit.json`. Exit 0 means structural/integrity checks passed, not legal clearance, native authentication or public readiness. Notice findings are separately reported.

`release:plan` performs the audit and writes `work/release/npm-plan.json`, binding the review to exact package and inventory hashes. It exits **1 intentionally** because remaining owner, notice, signing, target and publication gates are open. Populated configuration fields alone cannot pass authentication. Registry provenance is a post-publication check under S12; local pre-publication review never requires an already-published package. Both tools have no execution/upload mode.

To audit another local output directory:

```sh
node scripts/release-audit.mjs --candidate=path/to/candidate.json --out=work/release/other-audit.json
```

The tarball must be adjacent to that JSON; stale embedded absolute build paths are ignored. Packed `release/build-manifest.json` and `release/source-files.json` bind the source/lock/native/connector snapshot. If recorded source files change, rebuild before freezing another review. Generated S06 evidence under `docs/implementation/evidence/epic6-npm-release/` is excluded from source hashing to avoid self-referential artifact hashes. The shipped source list contains paths and hashes, not source contents or test answers.

`release/notices.json` inventories a conservative source production graph, which covers external server and bundled browser dependencies, plus esbuild's generated-helper notice. Conditional unused browser dependencies may be included; this is coverage rather than exact bundle attribution. Permission files are copied verbatim under `release/notices/`. Missing complete upstream texts and metadata-only findings remain distinct. Font/art and downloaded-connector notices are separate. A recorded notice is not a blanket rights approval.

The old archive verifier remains available for historical builds. It is not the default npm audit. `release-connector-inventory` optionally uses Go's read-only inspection tool on pinned local vendor binaries; it does not download them, execute foreign binaries or complete their notice review. No signing, account creation, publication or promotion was performed.
