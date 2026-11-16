// Assembly only: build application and native helpers first. No startup downloads.
import {cp,copyFile,mkdir,readFile,writeFile,rm,chmod} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSync,sign} from 'node:crypto';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {targets,sha256,inventory,productionPaths,launchers} from './package-lib.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const arg=process.argv.find(a=>a.startsWith('--target='))?.slice(9)??process.platform+'-'+process.arch;
const selected=arg==='all'?targets:[arg];
const nodes=JSON.parse(await readFile(join(root,'packaging/node-manifest.json')));
const connectors=JSON.parse(await readFile(join(root,'scripts/cloudflared-manifest.json')));
const lock=JSON.parse(await readFile(join(root,'package-lock.json')));
const cache=join(root,'tooling/package-cache'),output=join(root,'dist-release');
await mkdir(output,{recursive:true});
for(const target of selected){
 if(!targets.includes(target))throw new Error('Unsupported target '+target);
 const name='Niche-Out-0.1.0-private-'+target,stage=join(output,name),win=target==='win32-x64';
 await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});
 const copy=async(from,to=from)=>{await mkdir(join(stage,to,'..'),{recursive:true});await cp(join(root,from),join(stage,to),{recursive:true,dereference:true});};
 for(const path of ['apps/server/dist','apps/server/hosting-assets','apps/web/dist','examples','scripts/cloudflared-manifest.json','scripts/notices','docs/release/OPERATOR-GUIDE.md','docs/release/RELEASE-NOTES.md','docs/release/SIGNING.md'])await copy(path);
 for(const module of ['contracts','game-core']){
  for(const suffix of ['dist','package.json']){await copy('packages/'+module+'/'+suffix);await copy('packages/'+module+'/'+suffix,'node_modules/@rarity/'+module+'/'+suffix);}
 }
 for(const path of productionPaths(lock))await copy(path);
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');
 const publicPem=publicKey.export({type:'spki',format:'pem'});
 const verifyFunction=(await readFile(join(root,'packaging/manifest-signature.mjs'),'utf8')).replace(/^import .*;\n/,'').replace('export function','function');
 const bootstrap=(await readFile(join(root,'packaging/portable-start.mjs'),'utf8')).replace('__NICHE_TEST_PUBLIC_KEY__',JSON.stringify(publicPem)).replace('__NICHE_VERIFY_FUNCTION__',verifyFunction);
 await writeFile(join(stage,'scripts/portable-start.mjs'),bootstrap);

 for(const app of ['server','web'])await copy('apps/'+app+'/package.json');
 await writeFile(join(stage,'package.json'),JSON.stringify({name:'niche-out-portable',version:'0.1.0',private:true,type:'module'})+'\n');
 const pin=nodes.platforms[target],archive=join(cache,pin.asset),archiveBytes=await readFile(archive);
 if(sha256(archiveBytes)!==pin.sha256)throw new Error('Runtime archive checksum mismatch: '+target);
 const distro=pin.asset.replace(/\.tar\.gz$|\.zip$/,''),member=distro+'/'+(win?'node.exe':'bin/node');
 const runtime=execFileSync('tar',['-xOf',archive,member],{maxBuffer:200*1024**2});
 await mkdir(join(stage,'runtime'),{recursive:true});await writeFile(join(stage,'runtime',win?'node.exe':'node'),runtime,{mode:0o755});
 const license=execFileSync('tar',['-xOf',archive,distro+'/LICENSE'],{maxBuffer:10*1024**2});await writeFile(join(stage,'runtime/LICENSE'),license);
 await mkdir(join(stage,'tooling'),{recursive:true});
 const connectorName=win?'cloudflared.exe':'cloudflared',connector=await readFile(join(cache,'connector-'+target,connectorName));
 if(sha256(connector)!==connectors.platforms[target].executableSha256)throw new Error('Connector checksum mismatch: '+target);
 await writeFile(join(stage,'tooling',connectorName),connector,{mode:0o755});
 for(const helper of ['niche-platform.node',...(!win?['niche-guard']:[])]){
  await copyFile(join(root,'tooling/platform',target,helper),join(stage,'tooling',helper));await chmod(join(stage,'tooling',helper),0o755);
 }
 for(const [file,content] of Object.entries(launchers(target)))await writeFile(join(stage,file),content,{mode:0o755});
 await writeFile(join(stage,'READ-ME.txt'),`Niche Out — PRIVATE TEST BUILD\nTarget: ${target}\nNode ${nodes.version}; cloudflared ${connectors.version}.\n\nExtract the entire archive. Launch ${Object.keys(launchers(target))[0]}. Keep its console open. Closing the browser leaves hosting running; quit hosting or close the launcher to stop. Use Start hosting, wait for Ready, open the private host page, upload an example, then share the player QR/link. Internet is required for the temporary tunnel. No account, domain, Node install or startup download is needed.\n\nThis private build is not project-signed or notarized. Other-platform compatibility validation is deferred to the owner; availability of an archive is not evidence of compatibility. Public signing and release qualification belong to Epic 6.\n\nmacOS requires 15+, Windows requires 11 x64, Linux targets Ubuntu 24.04+ x64/glibc. Linux also needs systemd/logind and systemd-inhibit for sleep prevention and xdg-open for automatic browser opening. A missing idle inhibitor produces a local notice; keep the machine awake.\n\nIf startup reports a missing/corrupt resource, extract a fresh complete copy. The signed resource manifest detects changes against an ephemeral private-test key embedded in the bootstrap; it is not trusted publisher authentication. Epic 6 signs the bootstrap itself. Do not edit bundled examples in place: copy them elsewhere before editing because bundled files are verified.\n\nFor setup, recovery and troubleshooting, see docs/release/OPERATOR-GUIDE.md. Candidate limitations are in docs/release/RELEASE-NOTES.md.\n\nSee scripts/notices, runtime/LICENSE, apps/web/dist/asset-notices.txt and individual node_modules package licenses. Project open-source license selection remains a release prerequisite.\n`);
 const files=await inventory(stage);
 const sourceManifestSha256=sha256(await readFile(join(root,'build/manifest.json')));
 const manifestBytes=Buffer.from(JSON.stringify({schemaVersion:1,target,nodeVersion:nodes.version,connectorVersion:connectors.version,privateTestBuild:true,sourceManifestSha256,files},null,2)+'\n');
 await writeFile(join(stage,'portable-manifest.json'),manifestBytes);
 await writeFile(join(stage,'portable-manifest.sig'),sign(null,manifestBytes,privateKey));
 const archiveName=name+(win?'.zip':'.tar.gz'),archivePath=join(output,archiveName);
 await rm(archivePath,{force:true});
 if(win && process.platform==='linux')execFileSync('zip',['-q','-r',archivePath,name],{cwd:output});
 else if(win)execFileSync('tar',['--format','zip','-cf',archivePath,'-C',output,name]);
 else execFileSync('tar',['-czf',archivePath,'-C',output,name]);
 const digest=sha256(await readFile(archivePath));await writeFile(archivePath+'.sha256',digest+'  '+archiveName+'\n');
 console.log(JSON.stringify({target,archive:archivePath,sha256:digest,files:files.length,compatibility:'requires target execution evidence'}));
}
