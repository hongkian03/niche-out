import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyPortableResources, type PortableManifest } from '../../apps/server/src/hosting/resources.js';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'Niche Out 测试 ')); roots.push(root);
  const paths = ['apps/server/dist/hosting/launch.js', 'apps/web/dist/index.html', 'scripts/cloudflared-manifest.json',
    'runtime/node', 'tooling/cloudflared', 'tooling/niche-platform.node', 'tooling/niche-guard'];
  const manifest: PortableManifest = { schemaVersion: 1, target: 'darwin-arm64', nodeVersion: '24.22.3', files: [] };
  for (const path of paths) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), path);
    manifest.files.push({ path, sha256: createHash('sha256').update(path).digest('hex') }); }
  const save = () => writeFile(join(root, 'portable-manifest.json'), JSON.stringify(manifest)); await save();
  const verify = () => verifyPortableResources(root, { required: true, target: 'darwin-arm64', nodeVersion: '24.22.3' });
  return { root, manifest, save, verify };
}
describe('portable package resources', () => {
  it('verifies independently of cwd with spaces and non-English path segments', async () => {
    const f = await fixture(); expect(await f.verify()).toEqual(f.manifest);
  });
  it('allows absent manifests only for developer mode', async () => {
    const f = await fixture(); await rm(join(f.root, 'portable-manifest.json'));
    expect(await verifyPortableResources(f.root)).toBeNull(); await expect(f.verify()).rejects.toThrow('manifest is missing');
  });
  it.each(['runtime/node', 'tooling/cloudflared', 'apps/web/dist/index.html'])('detects altered %s', async path => {
    const f = await fixture(); await writeFile(join(f.root, path), 'corrupt'); await expect(f.verify()).rejects.toThrow('missing or damaged: ' + path);
  });
  it('rejects a missing required entry even if remaining file hashes match', async () => {
    const f = await fixture(); f.manifest.files = f.manifest.files.filter(x => x.path !== 'runtime/node'); await f.save();
    await expect(f.verify()).rejects.toThrow('omits a required resource');
  });
  it.each(['../outside', '/absolute', 'apps/../outside', 'C:/outside', 'apps\\outside'])('rejects unsafe path %s', async path => {
    const f = await fixture(); f.manifest.files[0]!.path = path; await f.save(); await expect(f.verify()).rejects.toThrow('unsafe or duplicate');
  });
  it('rejects symlink resources even when pointed-to contents match', async () => {
    const f = await fixture(); await writeFile(join(f.root, 'copy'), 'runtime/node'); await rm(join(f.root, 'runtime/node'));
    await symlink(join(f.root, 'copy'), join(f.root, 'runtime/node')); await expect(f.verify()).rejects.toThrow('missing or damaged');
  });
  it('rejects wrong platform/runtime before executing any bundled helper', async () => {
    const f = await fixture(); f.manifest.target = 'win32-x64'; await f.save(); await expect(f.verify()).rejects.toThrow('different operating system');
    f.manifest.target = 'darwin-arm64'; f.manifest.nodeVersion = '20.0.0'; await f.save(); await expect(f.verify()).rejects.toThrow('runtime version');
  });
});
