// Read-only local release inventory. No downloads, signing, private-key access or publication.
import {readFile, readdir, lstat, writeFile, mkdir} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {targets, sha256, productionPaths} from './package-lib.mjs';

export function parseChecksum(text, expectedName) {
  const match = /^([a-f0-9]{64}) [ *]([^\r\n]+)\r?\n?$/u.exec(text);
  if (!match || match[2] !== expectedName) throw new Error('Invalid or mismatched checksum sidecar');
  return match[1];
}

export async function auditRelease(root) {
  const problems = [];
  const lockBytes = await readFile(join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  const nodePin = JSON.parse(await readFile(join(root, 'packaging/node-manifest.json')));
  const connectorPin = JSON.parse(await readFile(join(root, 'scripts/cloudflared-manifest.json')));
  const buildBytes = await readFile(join(root, 'build/manifest.json'));
  const build = JSON.parse(buildBytes);
  if (build.lockSha256 !== sha256(lockBytes)) problems.push('Build manifest uses a different dependency lock');
  const notices = [];
  for (const path of productionPaths(lock)) {
    const metadata = lock.packages[path];
    const files = (await readdir(join(root, path))).filter(name => /^(licen[sc]e|copying|notice)(?:\.|$|-)/i.test(name));
    const texts = [];
    for (const name of files) {
      const full = join(root, path, name);
      if ((await lstat(full)).isFile()) texts.push({path: path + '/' + name, sha256: sha256(await readFile(full))});
    }
    const findings = [];
    if (!texts.length) findings.push('No standalone license/notice file in installed package; review upstream permission text');
    if (!metadata.license) findings.push('Lockfile has no license identifier; inspect included text before assigning metadata');
    notices.push({path, version: metadata.version, declaredLicense: metadata.license ?? null, files: texts, findings});
  }
  const artifacts = [];
  for (const target of targets) {
    const name = `Niche-Out-${lock.version}-private-${target}`;
    const archiveName = name + (target === 'win32-x64' ? '.zip' : '.tar.gz');
    const artifact = {target, archive: 'dist-release/' + archiveName, problems: []};
    try {
      const bytes = await readFile(join(root, artifact.archive));
      artifact.bytes = bytes.length;
      artifact.sha256 = sha256(bytes);
      const expected = parseChecksum(await readFile(join(root, artifact.archive + '.sha256'), 'utf8'), archiveName);
      if (expected !== artifact.sha256) artifact.problems.push('Archive checksum mismatch');
      const stage = join(root, 'dist-release', name);
      const manifest = JSON.parse(await readFile(join(stage, 'portable-manifest.json')));
      artifact.manifestSha256 = sha256(await readFile(join(stage, 'portable-manifest.json')));
      artifact.sourceManifestSha256 = manifest.sourceManifestSha256;
      artifact.privateTestBuild = manifest.privateTestBuild;
      artifact.inventoryFileCount = manifest.files.length;
      if (manifest.target !== target) artifact.problems.push('Manifest target mismatch');
      if (manifest.nodeVersion !== nodePin.version || manifest.connectorVersion !== connectorPin.version) artifact.problems.push('Pinned runtime/connector version mismatch');
      if (manifest.sourceManifestSha256 !== sha256(buildBytes)) artifact.problems.push('Archive staging predates current build manifest; refresh before final handoff');
      // A staging tree is audited separately from its archive. Its contents are not presumed identical.
      const required = ['runtime/LICENSE', 'scripts/notices/cloudflared-LICENSE.txt', 'apps/web/dist/VT323-OFL.txt', 'apps/web/dist/asset-notices.txt'];
      for (const file of required) {
        const entry = manifest.files.find(item => item.path === file);
        if (!entry || sha256(await readFile(join(stage, file))) !== entry.sha256) artifact.problems.push('Missing or changed required notice: ' + file);
      }
    } catch (error) { artifact.problems.push(error.message); }
    artifacts.push(artifact);
  }
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), product: 'Niche Out', version: lock.version,
    sourceBuild: {manifestSha256: sha256(buildBytes), sourceSha256: build.sourceSha256, lockSha256: sha256(lockBytes), node: nodePin.version, connector: connectorPin.version},
    scope: 'Archive checksums and separately extracted staging notices; not archive extraction, publisher verification, or legal clearance',
    artifacts, productionDependencyCount: notices.length, notices,
    unresolvedNoticeReview: ['abstract-logging complete permission/copyright text', 'cloudflared transitive Go dependency notices', 'project source and original-asset license decision'],
    problems, publicReleaseReady: false
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const allowed = process.argv.slice(2);
  if (allowed.some(arg => !arg.startsWith('--out='))) throw new Error('Usage: node scripts/release-audit.mjs [--out=path]');
  const report = await auditRelease(root);
  const output = resolve(root, allowed.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'work/release/audit.json');
  await mkdir(dirname(output), {recursive: true});
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({report: output, artifacts: report.artifacts.map(({target, bytes, sha256, problems}) => ({target, bytes, sha256, problems})), dependencies: report.productionDependencyCount, noticeFindings: report.notices.filter(item => item.findings.length).map(item => ({path: item.path, findings: item.findings})), publicReleaseReady: false}, null, 2));
  if (report.problems.length || report.artifacts.some(item => item.problems.length)) process.exitCode = 1;
}
