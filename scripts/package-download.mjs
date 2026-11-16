// Build-time only. Never invoked by a portable launcher.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const nodes = JSON.parse(await readFile(join(root, 'packaging/node-manifest.json')));
const connectors = JSON.parse(await readFile(join(root, 'scripts/cloudflared-manifest.json')));
const requested = process.argv.find(a => a.startsWith('--target='))?.slice(9) ?? process.platform + '-' + process.arch;
const targets = requested === 'all' ? Object.keys(nodes.platforms) : [requested];
const cache = join(root, 'tooling/package-cache');
await mkdir(cache, {recursive:true});
const hash = b => createHash('sha256').update(b).digest('hex');
async function download(url, path, expected) {
  try { if (hash(await readFile(path)) === expected) return; } catch {}
  // curl supplies the platform trust store/proxy support. Hash verification is mandatory.
  execFileSync('curl', ['--fail', '--location', '--retry', '2', '--max-time', '180', '--output', path + '.download', url], {stdio:'inherit'});
  const bytes = await readFile(path + '.download');
  if (hash(bytes) !== expected) throw new Error('Checksum mismatch: ' + url);
  await writeFile(path, bytes);
  const {unlink} = await import('node:fs/promises'); await unlink(path + '.download');
}
for (const target of targets) {
  const n = nodes.platforms[target], c = connectors.platforms[target];
  if (!n || !c) throw new Error('Unsupported target ' + target);
  const archive = join(cache,n.asset);
  await download('https://nodejs.org/dist/v'+nodes.version+'/'+n.asset, archive, n.sha256);
  const distro = join(cache, n.asset.replace(/\.tar\.gz$|\.zip$/,''));
  // Pinned upstream archives only; tar on all supported build platforms reads zip too.
  execFileSync('tar',['-xf',archive,'-C',cache]);
  const connectorDir = join(cache,'connector-'+target); await mkdir(connectorDir,{recursive:true});
  const connectorDownload = join(cache,c.asset);
  await download(c.url, connectorDownload,c.archiveSha256);
  const executable = join(connectorDir,target.startsWith('win32')?'cloudflared.exe':'cloudflared');
  if(c.archive==='tgz') execFileSync('tar',['-xzf',connectorDownload,'-C',connectorDir,'cloudflared']);
  else await writeFile(executable,await readFile(connectorDownload));
  if(hash(await readFile(executable))!==c.executableSha256) throw new Error('Connector executable mismatch: '+target);
  await chmod(executable,0o755);
  console.log(JSON.stringify({target,nodeDirectory:distro,connector:executable,verified:true}));
}
