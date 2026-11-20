// Build/pack only. Never publishes, downloads connectors or runs install hooks.
import {build} from 'esbuild';
import {readFile,writeFile,mkdir,cp,rm,chmod} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNpm} from './npm-command.mjs';
import {rewriteDocumentLinks,assertDocumentLinks} from './document-links.mjs';
import {generateReleaseNotices} from '../release-notices.mjs';
import {inventory,sha256,targets} from '../package-lib.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const directory=resolve(option('out-dir')??join(root,'dist-npm'));
const stage=join(directory,'package');
const version=option('version')??JSON.parse(await readFile(join(root,'package.json'))).version;
if(!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))throw Error('Invalid candidate version');
await mkdir(directory,{recursive:true});await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
const manifest={name:'niche-out',version,description:'Host custom Niche Out games from your own computer.',license:'MIT',type:'module',
  bin:{'niche-out':'bin/niche-out.cjs'},engines:{node:'>=24.22.3 <25'},
  files:['bin/','apps/','native/','native-manifest.json','scripts/','examples/','docs/','resources.json','release/','LICENSE','README.md','npm-shrinkwrap.json'],
  dependencies:{fastify:'5.12.8',qrcode:'1.5.4','socket.io':'4.8.4',zod:'4.6.7'},
  repository:{type:'git',url:'git+https://github.com/hongkian03/niche-out.git'}};
await writeFile(join(stage,'package.json'),JSON.stringify(manifest,null,2)+'\n');
const copy=async(from,to=from)=>{await mkdir(dirname(join(stage,to)),{recursive:true});await cp(join(root,from),join(stage,to),{recursive:true,dereference:true});};
for(const path of ['bin','apps/web/dist','apps/server/hosting-assets/local','examples','scripts/cloudflared-manifest.json','scripts/notices','LICENSE'])await copy(path);
for(const file of ['OPERATOR-GUIDE.md','RELEASE-NOTES.md','SIGNING.md'])await copy('docs/release/'+file);
const common={bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',alias:{'@rarity/contracts':join(root,'packages/contracts/src/index.ts'),'@rarity/game-core':join(root,'packages/game-core/src/index.ts')},logLevel:'warning'};
await build({...common,entryPoints:[join(root,'apps/server/src/hosting/launch.ts')],outfile:join(stage,'apps/server/dist/hosting/launch.js')});
await build({...common,entryPoints:[join(root,'apps/server/src/game/import-worker.ts')],outfile:join(stage,'apps/server/dist/game/import-worker.js')});
const nativeInventory=JSON.parse(await readFile(join(root,'tooling/native-manifest.json')));
for(const target of targets){
  const entries=nativeInventory.targets[target]?.files;if(!entries?.length)throw Error('Missing native inventory for '+target);
  for(const entry of entries){
    if(!entry.path.startsWith('native/'+target+'/')||entry.path.split('/').some(p=>p==='..'||p===''))throw Error('Unsafe native inventory');
    const filename=entry.path.split('/').at(-1),bytes=await readFile(join(root,'tooling/platform',target,filename));
    if(sha256(bytes)!==entry.sha256)throw Error('Native input digest mismatch: '+target+'/'+filename);
    await mkdir(dirname(join(stage,entry.path)),{recursive:true});await writeFile(join(stage,entry.path),bytes,{mode:0o755});
  }
}
await writeFile(join(stage,'native-manifest.json'),JSON.stringify(nativeInventory,null,2)+'\n');
await chmod(join(stage,'bin/niche-out.cjs'),0o755);
// Use the repository README; the document pass below adjusts omitted-source links.
await copy('README.md');
// Seed the production graph from the reviewed workspace lock. npm prunes unused
// entries but must not silently upgrade transitive dependencies while packaging.
const sourceLock=JSON.parse(await readFile(join(root,'package-lock.json')));
const seed={name:manifest.name,version,lockfileVersion:3,requires:true,packages:{'':{name:manifest.name,version,license:manifest.license,dependencies:manifest.dependencies,engines:manifest.engines,bin:manifest.bin},...Object.fromEntries(Object.entries(sourceLock.packages).filter(([path,p])=>path.startsWith('node_modules/')&&!p.dev&&!p.link))}};
await writeFile(join(stage,'package-lock.json'),JSON.stringify(seed,null,2)+'\n');
// Resolve production dependencies in isolated staging; shrinkwrap is the published lock.
runNpm(['install','--package-lock-only','--ignore-scripts','--omit=dev','--no-audit','--no-fund'],{cwd:stage,stdio:'pipe',timeout:120000});
runNpm(['shrinkwrap','--ignore-scripts'],{cwd:stage,stdio:'pipe',timeout:30000});
const lock=JSON.parse(await readFile(join(stage,'npm-shrinkwrap.json')));
if(Object.entries(lock.packages).some(([path,p])=>p.dev||p.link||path.includes('@rarity')||p.resolved?.startsWith('file:')))throw Error('Invalid staged runtime dependency graph');
for(const [path,p] of Object.entries(lock.packages)){if(!path)continue;if(sourceLock.packages[path]?.version!==p.version)throw Error('Packaging changed a locked runtime dependency: '+path);}
await generateReleaseNotices(root,stage,sourceLock,lock);
await copy('build/manifest.json','release/build-manifest.json');
await copy('build/source-files.json','release/source-files.json');
const documentFiles=(await inventory(stage)).map(file=>file.path);
await rewriteDocumentLinks({stage,sourceRoot:root,files:documentFiles});
await assertDocumentLinks({stage,files:documentFiles});
const files=await inventory(stage);
await writeFile(join(stage,'resources.json'),JSON.stringify({schemaVersion:1,kind:'npm',version,nodeRange:manifest.engines.node,sourceManifestSha256:sha256(await readFile(join(root,'build/manifest.json'))),files},null,2)+'\n');
const packed=JSON.parse(runNpm(['pack','--json','--ignore-scripts','--pack-destination',directory],{cwd:stage,encoding:'utf8',timeout:120000}));
if(packed.length!==1)throw Error('Expected one npm tarball');
const artifact=packed[0],bytes=await readFile(join(directory,artifact.filename));
const packedPaths=new Set(artifact.files.map(file=>file.path));
for(const file of files)if(!packedPaths.has(file.path))throw Error('npm omitted an inventoried resource: '+file.path);
for(const file of artifact.files){if(/^(?:node_modules|runtime|tooling|packages|tests|probes)\//.test(file.path)||/\.(?:ts|map)$/.test(file.path)||file.path.includes('krillion-reference'))throw Error('Unexpected npm package content: '+file.path);}
if(artifact.files.some(file=>/cloudflared(?:\.exe)?$/.test(file.path)))throw Error('Connector executables must not be bundled');
const result={schemaVersion:1,name:manifest.name,version,tarball:join(directory,artifact.filename),sha256:sha256(bytes),integrity:artifact.integrity,size:artifact.size,unpackedSize:artifact.unpackedSize,files:artifact.files.map(f=>({path:f.path,size:f.size,mode:f.mode})),nativeInventory,privateCandidate:true,published:false};
await writeFile(join(directory,'candidate.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
