import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {auditRelease} from '../../scripts/release-audit.mjs';
import {readNpmTarball} from '../../scripts/release-tar.mjs';
import {generateReleaseNotices} from '../../scripts/release-notices.mjs';
import {verifyConnectorNoticeInventory,applyNoticeReview} from '../../scripts/release-notice-review.mjs';
import {planRelease} from '../../scripts/release-plan.mjs';
import {parseGoModules} from '../../scripts/release-connector-inventory.mjs';
import {sha256,targets,parseChecksum} from '../../scripts/package-lib.mjs';
const config=JSON.parse(await readFile(new URL('../../packaging/release/candidate.json',import.meta.url)));
function tar(entries){
 const parts=[];
 for(const [path,data] of entries){
  const h=Buffer.alloc(512),bytes=Buffer.from(data.bytes??data),name=data.name??'package/'+path;
  assert(Buffer.byteLength(name)<=100);h.write(name);h.write((data.mode??0o755).toString(8).padStart(7,'0')+'\0',100);h.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);h.fill(32,148,156);h.write(data.type??'0',156);h.write('ustar\0',257);h.write([...h].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);parts.push(h,bytes,Buffer.alloc(Math.ceil(bytes.length/512)*512-bytes.length));
 }
 return gzipSync(Buffer.concat([...parts,Buffer.alloc(1024)]));
}
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'niche-npm-audit-')),files=new Map(),put=async(path,data)=>{await mkdir(join(root,path,'..'),{recursive:true});await writeFile(join(root,path),data)};
 const add=(path,data)=>files.set(path,Buffer.from(typeof data==='string'?data:JSON.stringify(data)));
 const license='MIT License\nCopyright (c) 2026 Kian Hong Tan\nPermission text';
 const sourceLock={version:'0.1.0',packages:{'node_modules/fastify':{version:'1.0.0',integrity:'sha512-fake',resolved:'https://registry.npmjs.org/fastify/-/fastify-1.0.0.tgz',license:'MIT'},'node_modules/esbuild':{version:'1.0.0',dev:true,license:'MIT'}}};
 const lockBytes=JSON.stringify(sourceLock),connector=JSON.stringify({version:'fixture',platforms:{}}),sourceFiles=[['src/input.js',sha256('source')]];
 await put('packaging/release/candidate.json',JSON.stringify({...config,version:'0.1.0'}));await put('LICENSE',license);await put('package-lock.json',lockBytes);await put('scripts/cloudflared-manifest.json',connector);await put('packaging/native/platform.c','platform');await put('packaging/native/guard.c','guard');await put('src/input.js','source');
 const lock={version:'0.1.0',packages:{'':{dependencies:{fastify:'1.0.0'}},'node_modules/fastify':sourceLock.packages['node_modules/fastify']}};
 add('package.json',{name:'niche-out',version:'0.1.0',license:'MIT',type:'module',bin:{'niche-out':'bin/niche-out.cjs'},engines:{node:'>=24.22.3 <25'},repository:{url:'git+https://github.com/hongkian03/niche-out.git'},dependencies:{fastify:'1.0.0'}});
 add('LICENSE',license);add('npm-shrinkwrap.json',lock);
 for(const p of ['bin/niche-out.cjs','apps/server/dist/hosting/launch.js','apps/server/dist/game/import-worker.js','apps/web/dist/index.html','apps/server/hosting-assets/local/dashboard.js','examples/game.example.json','examples/FORMAT.md','docs/release/OPERATOR-GUIDE.md','apps/web/dist/VT323-OFL.txt','apps/web/dist/asset-notices.txt','scripts/notices/cloudflared-LICENSE.txt'])add(p,'fixture');
 add('scripts/cloudflared-manifest.json',connector);
 const native={schemaVersion:1,napiVersion:8,sourceSha256:sha256('platformguard'),targets:{}};
 for(const target of targets){const paths=['native/'+target+'/niche-platform.node',...(!target.startsWith('win32')?['native/'+target+'/niche-guard']:[])];native.targets[target]={files:paths.map(path=>{add(path,'native');return{path,sha256:sha256('native')}})}}
 add('native-manifest.json',native);
 const build={sourceSha256:sha256(JSON.stringify(sourceFiles)),lockSha256:sha256(lockBytes),node:'24.22.3',npm:'npm@11.19.1',connector:{manifestSha256:sha256(connector)}};
 add('release/build-manifest.json',build);add('release/source-files.json',{formatVersion:1,files:sourceFiles});
 const dependencies=['node_modules/fastify','node_modules/esbuild'].map(path=>{const location='release/notices/'+path+'/LICENSE';add(location,'permission');return{path,version:'1.0.0',declaredLicense:'MIT',files:[{path:location,sha256:sha256('permission')}]};});
 add('release/notices.json',{sourceLockSha256:sha256(lockBytes),runtimeShrinkwrapSha256:sha256(files.get('npm-shrinkwrap.json')),dependencies});
 add('resources.json',{schemaVersion:1,kind:'npm',version:'0.1.0',nodeRange:'>=24.22.3 <25',sourceManifestSha256:sha256(files.get('release/build-manifest.json')),files:[...files].map(([path,bytes])=>({path,sha256:sha256(bytes)}))});
 const pack=async()=>{const bytes=tar(files);await put('dist-npm/niche-out-0.1.0.tgz',bytes);await put('dist-npm/candidate.json',JSON.stringify({name:'niche-out',version:'0.1.0',tarball:'/old/machine/niche-out-0.1.0.tgz',sha256:sha256(bytes),integrity:'sha512-'+createHash('sha512').update(bytes).digest('base64'),size:bytes.length,nativeInventory:native,files:[...files].map(([path,data])=>({path,size:(data.bytes??data).length,mode:data.mode??0o755}))}));};
 await pack();return{root,files,pack,put,sourceLock,lock,close:()=>rm(root,{recursive:true,force:true})};
}
test('checked-in metadata reuses MIT and npm direction, retaining deferred owner inputs',()=>{
 assert.equal(config.schemaVersion,2);assert.equal(config.distribution,'npm');assert.equal(config.ownerDecisions.projectLicenseSpdx,'MIT');
 const p=planRelease(config);assert.equal(config.ownerDecisions.npmAccountOrOrganization,'hongkian03');assert.equal(config.ownerDecisions.publisher,'Kian Hong Tan');assert(!p.blockers.some(b=>b.includes('Owner input deferred: npmAccountOrOrganization')||b.includes('Owner input deferred: publisher')));assert.equal(config.npmAccessCheck.loggedInAccount,'hongkian03');assert([200,404].includes(config.npmAccessCheck.registryStatus));assert(!p.blockers.some(b=>b.includes('ownership verification')));assert(!p.blockers.some(b=>b.includes('projectLicenseSpdx')));assert(!p.stages.join(' ').includes('four private candidates'));assert.equal(p.publicReleaseReady,false);
});
test('populated fields cannot manufacture publisher or registry attestation evidence',()=>{
 const c=structuredClone(config);Object.assign(c.ownerDecisions,{publisher:'fixture',npmAccountOrOrganization:'fixture',packageOwnershipVerified:true,assetRightsApproved:true});for(const name of Object.keys(c.signing))c.signing[name]='fixture';c.signing.windowsTimestampUrl='http://bad.invalid';c.unimplementedPrerequisites=[];c.noticeReviewComplete=true;c.publisherToolchain.trustedPublisherConfigured=true;c.publicationAuthorized=true;
 const audit={integrityPassed:true,artifact:{name:'niche-out',version:'0.1.0',sha256:'a'.repeat(64)},noticeFindings:[{path:'dependency',kind:'missing-permission-text'}]};
 for(const target of targets)c.optionalSignedTargetEvidence[target]={artifactSha256:'a'.repeat(64),report:'claimed.json'};
 const p=planRelease(c,audit);assert.equal(p.preparationReady,false);assert(p.blockers.some(b=>b.includes('Notice review required')));assert(!p.blockers.some(b=>b.includes('HTTPS')));assert.equal(p.publicationAuthorized,false);assert.equal(p.publicReleaseReady,false);assert(!p.blockers.some(b=>b.includes('already published')));
});
test('invalid metadata and execute flag fail without signing or uploads',()=>{
 assert.throws(()=>planRelease({...config,schemaVersion:1}));assert.throws(()=>planRelease({...config,version:'../bad'}));assert.throws(()=>planRelease({...config,packageName:'../bad'}));
 const r=spawnSync(process.execPath,[new URL('../../scripts/release-plan.mjs',import.meta.url).pathname,'--execute'],{encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/execution flags are unsupported/);
});
test('Go inventory preserves replacement forks',()=>{assert.deepEqual(parseGoModules('dep\tupstream\tv1\n=>\tfork\tv2\th1:abc\n'),[{path:'upstream',version:'v1',checksum:null,replacement:{path:'fork',version:'v2',checksum:'h1:abc'}}]);assert.throws(()=>parseGoModules('=>\torphan\tv1'));});
test('tar reader rejects traversal, duplicate files, links, damaged headers and trailing payload',()=>{
 for(const entries of [[['../escape','bad']],[['x','a'],['x','b']],[['link',{bytes:Buffer.alloc(0),type:'2'}]],[['link',{bytes:Buffer.alloc(0),type:'1'}]]])assert.throws(()=>readNpmTarball(tar(entries)));
 assert.throws(()=>readNpmTarball(Buffer.from('badgzip')));
 const raw=(gunzipSync(tar([['x','valid']])));raw[0]^=1;assert.throws(()=>readNpmTarball(gzipSync(raw)),/checksum/);
 const tail=Buffer.concat([gunzipSync(tar([['x','valid']])),Buffer.from('trailing')]);assert.throws(()=>readNpmTarball(gzipSync(tail)),/terminator/);
 assert.equal(readNpmTarball(tar([['x','valid']])).get('x').bytes.toString(),'valid');
});
test('actual adjacent tarball audits without a staging tree or runtime bundle',async()=>{
 const f=await fixture();try{const r=await auditRelease(f.root);assert.deepEqual(r.problems,[]);assert(r.integrityPassed);assert.equal(r.inventory.nativeTargets.length,4);assert.equal(r.inventory.productionDependencyCount,1);assert.equal(r.publicReleaseReady,false)}finally{await f.close()}
});
test('changed compressed bytes fail SHA-256 and npm integrity checks',async()=>{
 const f=await fixture();try{const bytes=tar([['changed','data']]);await f.put('dist-npm/niche-out-0.1.0.tgz',bytes);const r=await auditRelease(f.root);assert(!r.integrityPassed);assert(r.problems.includes('Tarball SHA-256 mismatch'));assert(r.problems.includes('Tarball npm integrity mismatch'))}finally{await f.close()}
});
for(const [label,mutate,expected] of [
 ['damaged worker',f=>f.files.set('apps/server/dist/game/import-worker.js',Buffer.from('changed')),'Packed digest mismatch'],
 ['missing notice text',f=>f.files.delete('release/notices/node_modules/fastify/LICENSE'),'Missing packed file'],
 ['unlisted private pack',f=>f.files.set('tests/private-answers.json',Buffer.from('private')),'Uninventoried'],
 ['bundled connector',f=>f.files.set('scripts/cloudflared',Buffer.from('binary')),'Connector must not'],
 ['embedded credential file',f=>f.files.set('release/notices/.env',Buffer.from('SECRET')),'Sensitive/development'],
 ['wrong API helper',f=>{const n=JSON.parse(f.files.get('native-manifest.json'));n.napiVersion=99;f.files.set('native-manifest.json',Buffer.from(JSON.stringify(n)))},'Native source/API mismatch']
])test('audit rejects '+label,async()=>{const f=await fixture();try{mutate(f);await f.pack();const r=await auditRelease(f.root);assert(!r.integrityPassed);assert(r.problems.some(p=>p.includes(expected)),JSON.stringify(r.problems))}finally{await f.close()}});
test('source drift fails even when compressed tar and inventories remain intact',async()=>{
 const f=await fixture();try{await f.put('src/input.js','changed source');const r=await auditRelease(f.root);assert(r.problems.some(p=>p.includes('Source changed since build')))}finally{await f.close()}
});
test('notice generator copies exact permission bytes and keeps incomplete upstream text visible',async()=>{
 const f=await fixture();try{
  for(const name of ['fastify','esbuild']){await f.put('node_modules/'+name+'/package.json',JSON.stringify({name,version:'1.0.0',license:'MIT'}));if(name==='esbuild')await f.put('node_modules/'+name+'/LICENSE','exact upstream permission');}
  const stage=join(f.root,'stage');await mkdir(stage);await writeFile(join(stage,'npm-shrinkwrap.json'),JSON.stringify(f.lock));
  const n=await generateReleaseNotices(f.root,stage,f.sourceLock,f.lock);assert(n.dependencies.find(d=>d.name==='fastify').findings.length);const e=n.dependencies.find(d=>d.name==='esbuild');assert.equal(await readFile(join(stage,e.files[0].path),'utf8'),'exact upstream permission');assert.equal(n.reviewComplete,false);
 }finally{await f.close()}
});


test('historical checksum helper remains available without reviving archive release gates',()=>{
 assert.equal(parseChecksum('a'.repeat(64)+'  old.tar.gz\n','old.tar.gz'),'a'.repeat(64));
 assert.throws(()=>parseChecksum('a'.repeat(64)+'  other.tar.gz\n','old.tar.gz'));
});
test('unknown example pack is rejected even after tarball metadata is refreshed',async()=>{
 const f=await fixture();try{f.files.set('examples/private-game.json',Buffer.from('private'));await f.pack();const r=await auditRelease(f.root);assert(r.problems.some(p=>p.includes('Unapproved example/private pack')))}finally{await f.close()}
});
test('changed source-lock dependency metadata fails the freeze binding',async()=>{
 const f=await fixture();try{f.sourceLock.packages['node_modules/fastify'].version='2.0.0';await f.put('package-lock.json',JSON.stringify(f.sourceLock));const r=await auditRelease(f.root);assert(r.problems.some(p=>p.includes('Source lock differs')));assert(r.problems.some(p=>p.includes('Dependency differs')))}finally{await f.close()}
});

test('candidate metadata copied from a Windows builder resolves only adjacent tarball',async()=>{
 const f=await fixture();try{const c=JSON.parse(await readFile(join(f.root,'dist-npm/candidate.json')));c.tarball=['C:','old','machine','niche-out-0.1.0.tgz'].join(String.fromCharCode(92));await f.put('dist-npm/candidate.json',JSON.stringify(c));const r=await auditRelease(f.root);assert(r.integrityPassed,JSON.stringify(r.problems))}finally{await f.close()}
});
test('CLI executable mode must survive actual packing, not just candidate metadata',async()=>{
 const f=await fixture();try{f.files.set('bin/niche-out.cjs',{bytes:f.files.get('bin/niche-out.cjs'),mode:0o644});await f.pack();const r=await auditRelease(f.root);assert(r.problems.includes('CLI executable bit missing'))}finally{await f.close()}
});

test('new-package access record does not grant access to a different account or existing package',()=>{
 for(const replacement of [{loggedInAccount:'other-account'},{registryStatus:200}]){
  const c=structuredClone(config);c.ownerDecisions.packageOwnershipVerified=false;Object.assign(c.npmAccessCheck,{registryStatus:404,loggedInAccount:c.ownerDecisions.npmAccountOrOrganization},replacement);assert(planRelease(c).blockers.some(b=>b.includes('ownership verification')));
 }
 const newPackage=structuredClone(config);newPackage.ownerDecisions.packageOwnershipVerified=false;newPackage.npmAccessCheck.registryStatus=404;assert(!planRelease(newPackage).blockers.some(b=>b.includes('ownership verification')));
 assert.equal(planRelease(config).publicReleaseReady,false);
});

function connectorReviewFixture(){
 const original={connectorVersion:'fixture',targets:[{buildInfo:'fixture: go1.27.4',modules:[{path:'original/module',version:'v1',replacement:{path:'fork/module',version:'v2',checksum:'h1:verified'}}]}]};
 const review={complete:true,connectorVersion:'fixture',connectorManifestSha256:'a'.repeat(64),modules:[{path:'fork/module',version:'v2',expectedSum:'h1:verified',sumVerified:true,status:'collected',files:[{path:'modules/0/LICENSE',source:'LICENSE',sha256:'b'.repeat(64)}]}],runtime:{version:'go1.27.4',files:[{path:'runtime/LICENSE',sha256:'c'.repeat(64)}]}};
 return{original,review};
}
test('connector notices bind exact replacement modules, runtime and file paths',()=>{
 const {original,review}=connectorReviewFixture();assert.equal(verifyConnectorNoticeInventory(review,original,'a'.repeat(64)).length,2);
 for(const modify of [r=>r.modules.splice(0),r=>r.modules[0].expectedSum='wrong',r=>r.modules[0].path='original/module',r=>r.modules[0].sumVerified=false,r=>r.runtime.version='other',r=>r.modules[0].files[0].path='../escape']){const bad=structuredClone(review);modify(bad);assert.throws(()=>verifyConnectorNoticeInventory(bad,original,'a'.repeat(64)))}
});
test('connector notice integration rejects changed permission bytes',async()=>{
 const f=await fixture();try{
  const {original,review}=connectorReviewFixture();const originalBytes=JSON.stringify(original);await f.put('docs/implementation/evidence/epic6-release/cloudflared-modules.json',originalBytes);
  review.connectorManifestSha256=sha256(await readFile(join(f.root,'scripts/cloudflared-manifest.json')));review.inputModuleInventorySha256=sha256(originalBytes);review.review={scope:'fixture'};
  for(const file of [...review.modules[0].files,...review.runtime.files]){file.sha256=sha256('permission');await f.put('packaging/notices/cloudflared/'+file.path,'permission')}
  await f.put('packaging/notices/cloudflared/inventory.json',JSON.stringify(review));const stage=join(f.root,'stage');await mkdir(stage,{recursive:true});
  const result=await applyNoticeReview(f.root,stage,[]);assert.equal(result.linkedDependencyNoticeReview,'complete');
  await f.put('packaging/notices/cloudflared/modules/0/LICENSE','changed');await assert.rejects(applyNoticeReview(f.root,stage,[]),/bytes changed/);
 }finally{await f.close()}
});
test('supplemental permission text requires matching installed version/readme provenance',async()=>{
 const f=await fixture();try{
  await f.put('scripts/notices/abstract-logging-2.0.1-source.json',JSON.stringify({package:'abstract-logging',version:'2.0.1',rawHtmlSha256:sha256('html'),textSha256:sha256('permission'),readmeSha256:sha256('original readme')}));await f.put('scripts/notices/abstract-logging-2.0.1-LICENSE.txt','permission');await f.put('node_modules/abstract-logging/Readme.md','changed readme');const stage=join(f.root,'stage');await mkdir(stage);
  await assert.rejects(applyNoticeReview(f.root,stage,[{name:'abstract-logging',version:'2.0.1',path:'node_modules/abstract-logging',files:[],findings:[]}]),/provenance mismatch/);
 }finally{await f.close()}
});

test('lean preparation needs no paid certificates, hosted publisher enrollment or all-target signing evidence',()=>{
 const c=structuredClone(config);c.signing={};c.publisherToolchain.trustedPublisherConfigured=false;c.optionalSignedTargetEvidence={};
 const p=planRelease(c,{integrityPassed:true,artifact:{name:c.packageName,version:c.version,sha256:'a'.repeat(64)},noticeFindings:[]});
 assert.deepEqual(p.blockers,[]);assert.equal(p.preparationReady,true);assert.equal(p.publicReleaseReady,false);assert.equal(p.publicationAuthorized,false);assert(p.requiredNextChecks.some(s=>s.startsWith('S10:')));assert(p.requiredNextChecks.some(s=>s.includes('explicit approval')));
});
test('lean release still blocks damaged artifacts, missing permission texts and unapproved rights',()=>{
 const c=structuredClone(config);c.ownerDecisions.assetRightsApproved=false;
 const p=planRelease(c,{integrityPassed:false,noticeFindings:[{path:'fixture',kind:'missing-permission-text'}]});
 assert.equal(p.preparationReady,false);assert(p.blockers.some(b=>b.includes('integrity audit')));assert(p.blockers.some(b=>b.includes('rights approval')));assert(p.blockers.some(b=>b.includes('Notice review required')));
});
