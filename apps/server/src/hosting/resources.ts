import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const applicationRoot = fileURLToPath(new URL('../../../../', import.meta.url));
export interface PortableManifest {
  schemaVersion: 1; target: string; nodeVersion: string;
  files: { path: string; sha256: string }[];
}
export class PackageResourceError extends Error {
  constructor(message: string) { super('Niche Out package: ' + message + ' Extract a fresh, complete copy of the download.'); }
}
/** Private-build corruption detection, not publisher authentication: E6 signs the final artifact. */
export async function verifyPortableResources(root = applicationRoot, options: {
  required?: boolean; target?: string; nodeVersion?: string;
} = {}): Promise<PortableManifest | null> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(join(root, 'portable-manifest.json'), 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !options.required) return null;
    throw new PackageResourceError('The resource manifest is missing or unreadable.');
  }
  const value = raw as PortableManifest;
  if (!value || value.schemaVersion !== 1 || typeof value.target !== 'string' || typeof value.nodeVersion !== 'string' ||
      !Array.isArray(value.files) || value.files.length === 0 || value.files.length > 100000) {
    throw new PackageResourceError('The resource manifest is invalid.');
  }
  if (value.target !== (options.target ?? process.platform + '-' + process.arch)) {
    throw new PackageResourceError('This download is for a different operating system or processor.');
  }
  if (value.nodeVersion !== (options.nodeVersion ?? process.versions.node)) {
    throw new PackageResourceError('The bundled Node runtime version does not match the manifest.');
  }
  const canonicalRoot = await realpath(root), seen = new Set<string>();
  for (const entry of value.files) {
    if (!entry || typeof entry.path !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        /[\\:\x00]/.test(entry.path) || entry.path.split('/').some(part => !part || part === '.' || part === '..') ||
        entry.path === 'portable-manifest.json' || seen.has(entry.path)) {
      throw new PackageResourceError('The resource manifest contains an unsafe or duplicate path.');
    }
    seen.add(entry.path);
    try {
      let current = canonicalRoot;
      const parts = entry.path.split('/');
      for (const [index, part] of parts.entries()) {
        current = join(current, part);
        const stat = await lstat(current);
        if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw Error('Unsafe resource');
      }
      if (createHash('sha256').update(await readFile(current)).digest('hex') !== entry.sha256) throw Error('Digest mismatch');
    } catch { throw new PackageResourceError('A bundled resource is missing or damaged: ' + entry.path + '.'); }
  }
  const windows = value.target.startsWith('win32-');
  const required = ['apps/server/dist/hosting/launch.js', 'apps/web/dist/index.html', 'scripts/cloudflared-manifest.json',
    windows ? 'runtime/node.exe' : 'runtime/node', windows ? 'tooling/cloudflared.exe' : 'tooling/cloudflared', 'tooling/niche-platform.node',
    ...(!windows ? ['tooling/niche-guard'] : [])];
  for (const path of required) if (!seen.has(path)) throw new PackageResourceError('The manifest omits a required resource: ' + path + '.');
  return value;
}
