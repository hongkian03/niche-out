// Maintainer-reviewed supplemental notice data; never fetches at build/runtime.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {sha256} from './package-lib.mjs';
import {safeResourcePath} from './release-tar.mjs';
async function optional(path){try{return await readFile(path)}catch(e){if(e.code==='ENOENT')return null;throw e}}
export function verifyConnectorNoticeInventory(review,original,manifestSha256){
 if(!review.complete||review.connectorManifestSha256!==manifestSha256||review.connectorVersion!==original.connectorVersion)throw Error('Stale connector notice catalogue');
 const expected=new Map();for(const t of original.targets)for(const module of t.modules){const m=module.replacement??module;expected.set(m.path+'@'+m.version,m.checksum)}
 if(!Array.isArray(review.modules)||review.modules.length!==expected.size)throw Error('Incomplete connector module notice inventory');
 const seen=new Set();
 for(const m of review.modules){const key=m.path+'@'+m.version;if(seen.has(key)||!expected.has(key)||m.status!=='collected'||m.sumVerified!==true||!m.expectedSum||m.expectedSum!==expected.get(key)||!m.files?.some(f=>/licen[sc]e|copying/i.test(f.source)))throw Error('Unverified connector module notices: '+key);seen.add(key)}
 if(!review.runtime?.version||!original.targets.every(t=>t.buildInfo.split('\n')[0].endsWith(': '+review.runtime.version))||!review.runtime.files?.some(f=>f.path==='runtime/LICENSE'))throw Error('Connector runtime notice mismatch');
 const files=[...review.modules.flatMap(m=>m.files),...review.runtime.files],paths=new Set();
 for(const f of files){if(!safeResourcePath(f.path)||paths.has(f.path)||! /^[a-f0-9]{64}$/.test(f.sha256))throw Error('Unsafe/duplicate connector notice file');paths.add(f.path)}
 return files;
}
export async function applyNoticeReview(root,stage,dependencies){
 const abstract=dependencies.find(e=>e.name==='abstract-logging'&&e.version==='2.0.1');
 const supplemental=await optional(join(root,'scripts/notices/abstract-logging-2.0.1-source.json'));
 if(abstract&&supplemental){
  const source=JSON.parse(supplemental),bytes=await readFile(join(root,'scripts/notices/abstract-logging-2.0.1-LICENSE.txt'));
  if(source.package!==abstract.name||source.version!==abstract.version||source.textSha256!==sha256(bytes)||source.readmeSha256!==sha256(await readFile(join(root,abstract.path,'Readme.md'))))throw Error('Supplemental abstract-logging notice provenance mismatch');
  if(source.rawHtmlSha256!==sha256(await readFile(join(root,'packaging/notices/abstract-logging-license-page.html.txt'))))throw Error('Supplemental license source snapshot mismatch');
  const path='release/notices/'+abstract.path+'/LICENSE.upstream.txt';await mkdir(dirname(join(stage,path)),{recursive:true});await writeFile(join(stage,path),bytes);
  abstract.files.push({path,sha256:sha256(bytes)});abstract.supplementalSource=source;abstract.findings=abstract.findings.filter(f=>!f.startsWith('Complete standalone'));
 }
 const base=join(root,'packaging/notices/cloudflared'),raw=await optional(join(base,'inventory.json'));
 if(!raw)return {linkedDependencyNoticeReview:'pending'};
 const review=JSON.parse(raw),originalBytes=await readFile(join(root,'docs/implementation/evidence/epic6-release/cloudflared-modules.json')),original=JSON.parse(originalBytes);
 if(review.inputModuleInventorySha256!==sha256(originalBytes))throw Error('Connector notice input inventory mismatch');
 const files=verifyConnectorNoticeInventory(review,original,sha256(await readFile(join(root,'scripts/cloudflared-manifest.json'))));
 for(const f of files){const bytes=await readFile(join(base,f.path));if(sha256(bytes)!==f.sha256)throw Error('Connector notice bytes changed: '+f.path);const path='release/notices/cloudflared/'+f.path;await mkdir(dirname(join(stage,path)),{recursive:true});await writeFile(join(stage,path),bytes)}
 const path='release/notices/cloudflared/inventory.json';await writeFile(join(stage,path),raw);
 return {linkedDependencyNoticeReview:'complete',inventory:{path,sha256:sha256(raw)},moduleCount:review.modules.length,noticeFileCount:files.length,scope:review.review.scope};
}
