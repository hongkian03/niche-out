// Audits actual npm tarball bytes; never extracts, executes, signs or uploads.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve,win32} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {targets,sha256,productionPaths} from './package-lib.mjs';
import {verifyConnectorNoticeInventory} from './release-notice-review.mjs';
import {readNpmTarball,safeResourcePath} from './release-tar.mjs';
export async function auditRelease(root,options={}){
 const r={schemaVersion:2,distribution:'npm',generatedAt:new Date().toISOString(),scope:'Actual npm tarball contents and frozen source/native/dependency/notice inventory; integrity is not publisher authentication or legal clearance.',problems:[],noticeFindings:[],integrityPassed:false,publicReleaseReady:false};
 const check=(ok,message)=>{if(!ok)r.problems.push(message)};
 try{
  const configBytes=await readFile(join(root,'packaging/release/candidate.json'),'utf8'),config=JSON.parse(configBytes);r.releaseConfigSha256=sha256(configBytes);
  const candidatePath=resolve(root,options.candidate??config.artifactCandidate),candidate=JSON.parse(await readFile(candidatePath,'utf8')),filename=win32.basename(candidate.tarball??'');
  if(!/^[a-zA-Z0-9_.-]+\.tgz$/u.test(filename))throw Error('Invalid candidate filename');
  const bytes=await readFile(join(dirname(candidatePath),filename)),integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
  r.artifact={name:candidate.name,version:candidate.version,filename,bytes:bytes.length,sha256:sha256(bytes),integrity};
  check(candidate.sha256===sha256(bytes),'Tarball SHA-256 mismatch');check(candidate.integrity===integrity,'Tarball npm integrity mismatch');check(candidate.size===bytes.length,'Tarball byte count mismatch');
  const files=readNpmTarball(bytes);
  function required(path){if(!files.has(path))throw Error('Missing packed file: '+path);return files.get(path).bytes}
  const json=path=>JSON.parse(required(path).toString('utf8'));
  const digest=(path,hash)=>check(/^[a-f0-9]{64}$/u.test(hash??'')&&sha256(required(path))===hash,'Packed digest mismatch: '+path);
  const pkg=json('package.json'),resources=json('resources.json'),native=json('native-manifest.json'),lock=json('npm-shrinkwrap.json');
  check(config.schemaVersion===2&&config.distribution==='npm','Release config requires npm schema 2');
  check(pkg.name===config.packageName&&pkg.name===candidate.name,'Package name mismatch');
  check(pkg.version===config.version&&pkg.version===candidate.version&&resources.version===pkg.version&&lock.version===pkg.version,'Package version mismatch');
  check(pkg.license===config.ownerDecisions.projectLicenseSpdx,'Project license metadata mismatch');
  check(required('LICENSE').equals(await readFile(join(root,'LICENSE'))),'Project license differs from source');
  check(required('LICENSE').toString().includes(config.ownerDecisions.copyrightNotice),'Copyright metadata mismatch');
  check(pkg.engines?.node===config.hostNodeRange&&resources.nodeRange===config.hostNodeRange,'Host Node range mismatch');
  check(!pkg.scripts&&!pkg.devDependencies&&!pkg.optionalDependencies,'Install hooks/development/optional dependencies forbidden');
  check(pkg.private!==true&&pkg.type==='module'&&pkg.bin?.['niche-out']==='bin/niche-out.cjs','Invalid CLI manifest');
  check(pkg.repository?.url==='git+'+config.repository+'.git','Repository association mismatch');
  if(resources.schemaVersion!==1||resources.kind!=='npm'||!Array.isArray(resources.files))throw Error('Invalid resource manifest');
  const covered=new Set();
  for(const item of resources.files){if(!safeResourcePath(item.path)||covered.has(item.path)||item.path==='resources.json')throw Error('Unsafe/duplicate resource inventory');covered.add(item.path);digest(item.path,item.sha256)}
  check(files.size===covered.size+1&&[...files.keys()].every(path=>path==='resources.json'||covered.has(path)),'Uninventoried or missing packed files');
  check(Array.isArray(candidate.files)&&candidate.files.length===files.size,'Candidate file list mismatch');
  if(candidate.unpackedSize!==undefined)check(candidate.unpackedSize===[...files.values()].reduce((sum,f)=>sum+f.bytes.length,0),'Unpacked byte count mismatch');
  const listed=new Set();
  for(const item of candidate.files??[]){if(listed.has(item.path))throw Error('Duplicate candidate inventory');listed.add(item.path);const e=files.get(item.path);check(Boolean(e)&&e.bytes.length===item.size&&(e.mode&0o777)===(item.mode&0o777),'Candidate file metadata mismatch: '+item.path)}
  const allowed=/^(?:bin\/[^/]+\.cjs|apps\/web\/dist\/.+|apps\/server\/dist\/(?:hosting\/launch|game\/import-worker)\.js|apps\/server\/hosting-assets\/local\/[^/]+|native\/(?:darwin-arm64|darwin-x64|win32-x64|linux-x64)\/(?:niche-platform\.node|niche-guard)|scripts\/cloudflared-manifest\.json|scripts\/notices\/[^/]+|examples\/[^/]+|docs\/release\/[^/]+\.md|release\/(?:build-manifest|source-files|notices)\.json|release\/notices\/.+|(?:package|resources|native-manifest)\.json|npm-shrinkwrap\.json|LICENSE|README\.md)$/u;
  for(const path of files.keys()){
   check(allowed.test(path),'Unexpected packed file: '+path);
   if(path.startsWith('examples/'))check(['examples/FORMAT.md','examples/game.example.json','examples/game.five-rounds.json','examples/game.singapore.json','examples/game.singapore.sources.md'].includes(path),'Unapproved example/private pack: '+path);
   check(!/(?:^|\/)(?:\.env(?:\..*)?|\.npmrc|\.git|id_rsa|id_ed25519)$/u.test(path)&&! /\.(?:pem|p12|pfx|map|ts)$/u.test(path),'Sensitive/development file: '+path);
   check(!/(?:^|\/)cloudflared(?:\.exe)?$/u.test(path),'Connector must not be bundled');
  }
  for(const path of ['bin/niche-out.cjs','apps/server/dist/hosting/launch.js','apps/server/dist/game/import-worker.js','apps/web/dist/index.html','apps/server/hosting-assets/local/dashboard.js','examples/game.example.json','examples/FORMAT.md','docs/release/OPERATOR-GUIDE.md'])required(path);
  check((files.get('bin/niche-out.cjs').mode&0o111)!==0,'CLI executable bit missing');
  const sourceLockBytes=await readFile(join(root,'package-lock.json')),sourceLock=JSON.parse(sourceLockBytes),buildBytes=required('release/build-manifest.json'),build=json('release/build-manifest.json'),sources=json('release/source-files.json');
  digest('release/build-manifest.json',resources.sourceManifestSha256);
  check(build.lockSha256===sha256(sourceLockBytes),'Source lock differs from frozen build');
  if(!Array.isArray(sources.files)||!sources.files.length)throw Error('Missing source inventory');
  check(build.sourceSha256===sha256(JSON.stringify(sources.files)),'Source inventory/build digest mismatch');
  const sourceNames=new Set();
  for(const [path,hash] of sources.files){if(!safeResourcePath(path)||sourceNames.has(path)||! /^[a-f0-9]{64}$/u.test(hash))throw Error('Invalid source inventory');sourceNames.add(path);check(sha256(await readFile(join(root,path)))===hash,'Source changed since build: '+path)}
  const deps=Object.entries(lock.packages??{}).filter(([path])=>path);
  for(const [path,item] of deps){
   check(path.startsWith('node_modules/')&&safeResourcePath(path)&&!item.dev&&!item.link&&!path.includes('@rarity'),'Private/development dependency: '+path);
   check(typeof item.integrity==='string'&&typeof item.resolved==='string'&&item.resolved.startsWith('https://registry.npmjs.org/'),'Unpinned/non-registry dependency: '+path);
   const source=sourceLock.packages[path];check(item.version===source?.version&&item.integrity===source?.integrity&&item.resolved===source?.resolved,'Dependency differs from reviewed lock: '+path);
  }
  for(const [name,version] of Object.entries(pkg.dependencies??{}))check(lock.packages['node_modules/'+name]?.version===version&&lock.packages['']?.dependencies?.[name]===version,'Unresolved runtime dependency: '+name);
  for(const path of ['apps/server/dist/hosting/launch.js','apps/server/dist/game/import-worker.js'])check(!/(?:from\s*|import\s*\()['"]@rarity\//u.test(required(path).toString()),'Unresolved private workspace import: '+path);
  const nativeSource=sha256(Buffer.concat(await Promise.all(['platform.c','guard.c'].map(name=>readFile(join(root,'packaging/native',name))))));
  check(native.napiVersion===8&&native.sourceSha256===nativeSource,'Native source/API mismatch');
  for(const target of targets){
   const expected=['native/'+target+'/niche-platform.node',...(!target.startsWith('win32')?['native/'+target+'/niche-guard']:[])],entries=native.targets?.[target]?.files;
   check(Array.isArray(entries)&&entries.length===expected.length&&expected.every(path=>entries.some(e=>e.path===path)),'Native target inventory mismatch: '+target);
   for(const e of entries??[]){if(!expected.includes(e.path))throw Error('Unexpected native resource');digest(e.path,e.sha256);check((files.get(e.path).mode&0o111)!==0,'Native executable bit missing: '+e.path)}
  }
  check(JSON.stringify(candidate.nativeInventory)===JSON.stringify(native),'Candidate native inventory differs from tarball');
  const connector=required('scripts/cloudflared-manifest.json');check(connector.equals(await readFile(join(root,'scripts/cloudflared-manifest.json'))),'Connector differs from pinned source');check(build.connector?.manifestSha256===sha256(connector),'Frozen connector mismatch');
  const notices=json('release/notices.json');check(notices.sourceLockSha256===sha256(sourceLockBytes)&&notices.runtimeShrinkwrapSha256===sha256(required('npm-shrinkwrap.json')),'Notice graph differs from dependencies');
  const noticePaths=new Set();
  for(const e of notices.dependencies??[]){
   check(!noticePaths.has(e.path),'Duplicate notice dependency');noticePaths.add(e.path);check(sourceLock.packages[e.path]?.version===e.version,'Notice dependency version mismatch: '+e.path);
   for(const file of e.files??[]){if(!file.path.startsWith('release/notices/')||!safeResourcePath(file.path))throw Error('Unsafe notice path');digest(file.path,file.sha256)}
   if(!e.files?.length)r.noticeFindings.push({path:e.path,kind:'missing-permission-text'});
   if(!e.declaredLicense)r.noticeFindings.push({path:e.path,kind:'missing-license-metadata'});
  }
  for(const path of [...productionPaths(sourceLock),'node_modules/esbuild',...deps.map(([path])=>path)])check(noticePaths.has(path),'Missing notice dependency: '+path);
  for(const path of ['apps/web/dist/VT323-OFL.txt','apps/web/dist/asset-notices.txt','scripts/notices/cloudflared-LICENSE.txt'])required(path);
  if(notices.connector?.linkedDependencyNoticeReview==='complete'){
   const e=notices.connector.inventory;if(!e?.path?.startsWith('release/notices/cloudflared/')||!safeResourcePath(e.path))throw Error('Invalid connector notice inventory path');digest(e.path,e.sha256);
   const originalBytes=await readFile(join(root,'docs/implementation/evidence/epic6-release/cloudflared-modules.json')),review=json(e.path);
   check(review.inputModuleInventorySha256===sha256(originalBytes),'Connector notice source inventory mismatch');
   for(const f of verifyConnectorNoticeInventory(review,JSON.parse(originalBytes),sha256(connector)))digest('release/notices/cloudflared/'+f.path,f.sha256);
  }else r.noticeFindings.push({path:'downloaded-cloudflared',kind:'linked-dependency-notice-review-pending'});
  r.inventory={fileCount:files.size,sourceFileCount:sources.files.length,nativeTargets:targets,productionDependencyCount:deps.length,noticeDependencyCount:noticePaths.size};
  r.sourceBuild={manifestSha256:sha256(buildBytes),sourceSha256:build.sourceSha256,lockSha256:build.lockSha256,gitCommit:build.gitCommit,node:build.node,npm:build.npm};
  r.bindings={resourcesSha256:sha256(required('resources.json')),nativeManifestSha256:sha256(required('native-manifest.json')),connectorManifestSha256:sha256(connector),shrinkwrapSha256:sha256(required('npm-shrinkwrap.json')),noticesSha256:sha256(required('release/notices.json'))};
  r.integrityPassed=r.problems.length===0;
 }catch(error){r.problems.push(error.message)}
 return r;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2);
 if(args.some(arg=>!/^--(?:out|candidate)=.+/u.test(arg)))throw Error('Usage: node scripts/release-audit.mjs [--candidate=path] [--out=path]');
 const report=await auditRelease(root,{candidate:args.find(a=>a.startsWith('--candidate='))?.slice(12)}),out=resolve(root,args.find(a=>a.startsWith('--out='))?.slice(6)??'work/release/npm-audit.json');
 await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({report:out,artifact:report.artifact,inventory:report.inventory,problems:report.problems,noticeFindings:report.noticeFindings,integrityPassed:report.integrityPassed,publicReleaseReady:false},null,2));
 if(!report.integrityPassed)process.exitCode=1;
}
