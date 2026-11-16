import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseChecksum, auditRelease} from '../../scripts/release-audit.mjs';
import {planRelease} from '../../scripts/release-plan.mjs';
import {parseGoModules} from '../../scripts/release-connector-inventory.mjs';
import {sha256, targets} from '../../scripts/package-lib.mjs';

test('checksum binds exactly one digest to the exact final archive filename', () => {
  const digest = 'a'.repeat(64);
  assert.equal(parseChecksum(digest + '  candidate.zip\n', 'candidate.zip'), digest);
  assert.throws(() => parseChecksum(digest + '  other.zip\n', 'candidate.zip'));
  assert.throws(() => parseChecksum(digest + '  candidate.zip\n' + digest + '  extra.zip\n', 'candidate.zip'));
  assert.throws(() => parseChecksum('oops  candidate.zip\n', 'candidate.zip'));
});
test('checked-in candidate records missing owner decisions and actual implementation blockers', async () => {
  const candidate = JSON.parse(await readFile(new URL('../../packaging/release/candidate.json', import.meta.url)));
  const plan = planRelease(candidate);
  assert.equal(plan.publicReleaseReady, false);
  assert.equal(plan.executionImplemented, false);
  assert(plan.blockers.some(item => item.includes('projectLicenseSpdx')));
  assert(plan.blockers.some(item => item.includes('windows-authenticode-native-resource-verifier')));
  assert.equal(plan.blockers.filter(item => item.startsWith('Final signed target')).length, 4);
});
test('filled configuration cannot manufacture signing or publication evidence', () => {
  const plan = planRelease({schemaVersion:1,productName:'Niche Out',version:'0.1.0',publicationAuthorized:true,ownerDecisions:{publisher:'test',projectLicenseSpdx:'MIT',copyrightNotice:'test',assetRightsApproved:true},signing:{macDeveloperId:'test',macTeamId:'test',macNotaryKeychainProfile:'test',windowsCertificateThumbprint:'test',windowsTimestampUrl:'http://insecure.invalid',linuxOpenPgpFingerprint:'test'},noticeReviewComplete:true,unimplementedPrerequisites:[]});
  assert.equal(plan.publicReleaseReady, false);
  assert(plan.blockers.some(item => item.includes('HTTPS')));
  assert.equal(plan.blockers.filter(item => item.startsWith('Final signed target')).length, 4);
});
test('malformed configuration and execution flag fail closed without external commands', () => {
  assert.throws(() => planRelease({schemaVersion:2}));
  assert.throws(() => planRelease({schemaVersion:1,productName:'Niche Out',version:'../../outside'}));
  const result = spawnSync(process.execPath, [new URL('../../scripts/release-plan.mjs', import.meta.url).pathname, '--execute'], {encoding:'utf8'});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /execution flags are unsupported/);
});
test('Go inventory retains dependency replacements instead of attributing only the original module', () => {
  const modules = parseGoModules('binary: go1.27\n\tdep\tupstream/module\tv1.2.3\n\t=>\tfork/module\tv1.2.4\th1:abc=\n');
  assert.deepEqual(modules, [{path:'upstream/module',version:'v1.2.3',checksum:null,replacement:{path:'fork/module',version:'v1.2.4',checksum:'h1:abc='}}]);
  assert.throws(() => parseGoModules('\t=>\torphan\tv1\n'));
  assert.throws(() => parseGoModules('not a Go binary'));
});
test('artifact audit catches modified archive, stale build and absent notice without certifying public release', async () => {
  const root = await mkdtemp(join(tmpdir(),'niche-release-audit-'));
  const put = async (path, bytes) => {
    await mkdir(join(root,path,'..'),{recursive:true});
    await writeFile(join(root,path),bytes);
  };
  try {
    const lock = JSON.stringify({version:'0.1.0',packages:{}});
    const build = JSON.stringify({sourceSha256:'source',lockSha256:sha256(lock)});
    await put('package-lock.json',lock);
    await put('build/manifest.json',build);
    await put('packaging/node-manifest.json',JSON.stringify({version:'24.22.3'}));
    await put('scripts/cloudflared-manifest.json',JSON.stringify({version:'2026.11.0'}));
    for (const target of targets) {
      const name = 'Niche-Out-0.1.0-private-' + target;
      const archive = name + (target.startsWith('win32') ? '.zip' : '.tar.gz');
      await put('dist-release/' + archive,'archive input');
      await put('dist-release/' + archive + '.sha256',sha256('archive input') + '  ' + archive + '\n');
      const paths = ['runtime/LICENSE','scripts/notices/cloudflared-LICENSE.txt','apps/web/dist/VT323-OFL.txt','apps/web/dist/asset-notices.txt'];
      for(const path of paths) await put('dist-release/' + name + '/' + path,'notice');
      await put('dist-release/' + name + '/portable-manifest.json',JSON.stringify({target,nodeVersion:'24.22.3',connectorVersion:'2026.11.0',sourceManifestSha256:sha256(build),privateTestBuild:true,files:paths.map(path=>({path,sha256:sha256('notice')}))}));
    }
    const clean = await auditRelease(root);
    assert(clean.artifacts.every(item=>item.problems.length===0));
    assert.equal(clean.publicReleaseReady,false);
    await put('dist-release/Niche-Out-0.1.0-private-darwin-arm64.tar.gz','changed');
    await put('build/manifest.json',JSON.stringify({sourceSha256:'new',lockSha256:sha256(lock)}));
    await rm(join(root,'dist-release/Niche-Out-0.1.0-private-darwin-x64/runtime/LICENSE'));
    const bad = await auditRelease(root);
    assert(bad.artifacts[0].problems.includes('Archive checksum mismatch'));
    assert(bad.artifacts.every(item=>item.problems.some(problem=>problem.includes('predates'))));
    assert(bad.artifacts[1].problems.some(problem=>problem.includes('ENOENT')));
  } finally { await rm(root,{recursive:true,force:true}); }
});
