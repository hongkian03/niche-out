// Verifies our locally built private archives after extraction; never runs foreign-target executables.
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { targets, inventory, sha256, parseChecksum } from './package-lib.mjs';
import { verifyManifestSignature } from '../packaging/manifest-signature.mjs';
import { verifyPortableResources } from '../apps/server/dist/hosting/resources.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'work/epic6'); await mkdir(output, { recursive: true });
const report = { date: new Date().toISOString(), status: 'RUNNING',
  scope: 'Actual archive extraction, checksum, private test signature, exact file inventory and resource integrity. Not publisher authentication or cross-platform execution.', artifacts: [] };
const saveReport = async () => {
  await writeFile(join(output, 'assembly-verification.json'), JSON.stringify(report, null, 2) + '\n');
  await mkdir(join(root, 'dist-release'), { recursive: true });
  await writeFile(join(root, 'dist-release/assembly-verification.json'), JSON.stringify(report, null, 2) + '\n');
};
await saveReport();
try {
const extracted = report.extracted = await mkdtemp(join(output, 'archives-'));
const source = await readFile(join(root, 'build/manifest.json'));
report.sourceManifestSha256 = sha256(source);
const version = JSON.parse(await readFile(join(root, 'package.json'))).version;
const nodeVersion = JSON.parse(await readFile(join(root, 'packaging/node-manifest.json'))).version;
const connectorVersion = JSON.parse(await readFile(join(root, 'scripts/cloudflared-manifest.json'))).version;
for (const target of targets) {
  const name = `Niche-Out-${version}-private-${target}`;
  const archiveName = name + (target === 'win32-x64' ? '.zip' : '.tar.gz');
  const archive = join(root, 'dist-release', archiveName);
  const bytes = await readFile(archive);
  const digest = sha256(bytes);
  assert.equal(digest, parseChecksum(await readFile(archive + '.sha256', 'utf8'), archiveName));
  // These are our own assembly outputs. Reject unexpected names before extracting them.
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8', maxBuffer: 8 * 1024 ** 2 }).trim().split('\n');
  for (const entry of entries) assert(entry === name + '/' || entry.startsWith(name + '/') && !entry.split('/').includes('..') && !entry.includes('\\'), 'Unexpected archive entry');
  execFileSync('tar', ['-xf', archive, '-C', extracted]);
  const directory = resolve(extracted, name);
  const manifestBytes = await readFile(join(directory, 'portable-manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.sourceManifestSha256, report.sourceManifestSha256);
  assert.equal(manifest.privateTestBuild, true);
  assert.equal(manifest.connectorVersion, connectorVersion);
  for (const path of ['docs/release/OPERATOR-GUIDE.md', 'docs/release/RELEASE-NOTES.md', 'docs/release/SIGNING.md']) {
    assert(manifest.files.some(file => file.path === path), 'Missing packaged guide: ' + path);
  }
  const bootstrap = await readFile(join(directory, 'scripts/portable-start.mjs'), 'utf8');
  const publicKeyLiteral = bootstrap.match(/^const publicKey=("(?:[^"\\]|\\.)*");$/m)?.[1];
  assert(publicKeyLiteral, 'Private test manifest key missing');
  verifyManifestSignature(manifestBytes, await readFile(join(directory, 'portable-manifest.sig')), JSON.parse(publicKeyLiteral));
  await verifyPortableResources(directory, { required: true, target, nodeVersion });
  const files = (await inventory(directory)).filter(file => !['portable-manifest.json', 'portable-manifest.sig'].includes(file.path));
  assert.deepEqual(files, manifest.files, 'Extracted file set differs from signed resource inventory');
  if (target !== 'win32-x64') for (const path of ['runtime/node', 'tooling/cloudflared', 'tooling/niche-guard', target.startsWith('darwin') ? 'Start Niche Out.command' : 'start-niche-out.sh']) {
    assert((await stat(join(directory, path))).mode & 0o111, 'Missing executable mode: ' + path);
  }
  report.artifacts.push({ target, archive: archiveName, sha256: digest, bytes: bytes.length, manifestSha256: sha256(manifestBytes), files: files.length, directory });
  console.log('PASS extracted archive: ' + target + ' (' + files.length + ' files)');
}
await writeFile(join(root, 'dist-release/source-build-manifest.json'), source);
report.status = 'PASS';
console.log('PASS all four private archives; extracted files retained for native-target smoke testing.');
} catch (error) {
  report.status = 'FAIL'; report.error = error.message; process.exitCode = 1; console.error(error);
} finally { await saveReport(); }
