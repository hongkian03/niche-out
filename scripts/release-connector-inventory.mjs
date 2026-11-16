// Inspect pinned binaries with Go's read-only build-info reader; never execute connectors.
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {join, resolve} from 'node:path';
import {targets, sha256} from './package-lib.mjs';

export function parseGoModules(text) {
  const modules = [];
  for (const line of text.split(/\r?\n/u)) {
    const parts = line.trim().split('\t');
    if (parts[0] === 'dep') modules.push({path:parts[1],version:parts[2],checksum:parts[3] || null});
    if (parts[0] === '=>') {
      if (!modules.length) throw new Error('Replacement without dependency');
      modules.at(-1).replacement = {path:parts[1],version:parts[2],checksum:parts[3] || null};
    }
  }
  if (!modules.length || modules.some(item => !item.path || !item.version)) throw new Error('Missing/malformed Go dependency metadata');
  return modules;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/release-connector-inventory.mjs');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const pin = JSON.parse(await readFile(join(root, 'scripts/cloudflared-manifest.json')));
  const result = {schemaVersion:1,connectorVersion:pin.version,licenseReviewComplete:false,targets:[]};
  for (const target of targets) {
    const path = join(root, 'tooling/package-cache/connector-' + target, target.startsWith('win32') ? 'cloudflared.exe' : 'cloudflared');
    const hash = sha256(await readFile(path));
    if (hash !== pin.platforms[target].executableSha256) throw new Error('Connector input checksum mismatch: ' + target);
    const buildInfo = execFileSync('go', ['version','-m',path], {encoding:'utf8', maxBuffer:2 * 1024 ** 2});
    result.targets.push({target,executableSha256:hash,modules:parseGoModules(buildInfo),buildInfo:buildInfo.replaceAll(root + '/', '')});
  }
  await mkdir(join(root,'work/release'),{recursive:true});
  await writeFile(join(root,'work/release/cloudflared-modules.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({report:'work/release/cloudflared-modules.json',targets:result.targets.map(({target,modules})=>({target,modules:modules.length})),licenseReviewComplete:false},null,2));
}
