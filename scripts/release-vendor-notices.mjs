// Explicit maintainer investigation only: verified Go module downloads, never connector execution.
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {join,resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),out=resolve(root,'work/notice-review/cloudflared'),cache=join(out,'go-cache');await mkdir(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const inventoryBytes=await readFile('docs/implementation/evidence/epic6-release/cloudflared-modules.json'),inventory=JSON.parse(inventoryBytes),pins=JSON.parse(await readFile('scripts/cloudflared-manifest.json'));
if(inventory.connectorVersion!==pins.version)throw Error('Stale connector module inventory');
const unique=new Map();
for(const t of inventory.targets){
 if(t.executableSha256!==pins.platforms[t.target].executableSha256)throw Error('Module inventory executable mismatch');
 for(const d of t.modules){const actual=d.replacement??d,key=actual.path+'@'+actual.version;let e=unique.get(key);if(!e){e={...actual,targets:[],origins:[]};unique.set(key,e)}if(e.checksum!==actual.checksum)throw Error('Conflicting module checksum');e.targets.push(t.target);e.origins.push(d.path)}
}
async function inspect(entry,index){
 const item={path:entry.path,version:entry.version,expectedSum:entry.checksum,targets:[...new Set(entry.targets)],origins:[...new Set(entry.origins)],files:[]};
 try{
  const output=await new Promise((res,rej)=>execFile('/usr/local/go/bin/go',['mod','download','-json',entry.path+'@'+entry.version],{cwd:out,timeout:90000,maxBuffer:2*1024*1024,env:{...process.env,GOPATH:join(cache,'path'),GOMODCACHE:join(cache,'modules'),GOCACHE:join(cache,'build'),GOPROXY:'https://proxy.golang.org',GOSUMDB:'sum.golang.org',GONOSUMDB:'',GOPRIVATE:'',GONOPROXY:'',GOTOOLCHAIN:'local',GO111MODULE:'on'}},(error,stdout)=>{if(error)rej(Error((()=>{try{return JSON.parse(stdout).Error}catch{return error.code??'download failed'}})()));else res(stdout)}));
  const meta=JSON.parse(output);if(!entry.checksum||meta.Sum!==entry.checksum||!meta.Dir)throw Error('Module checksum/source mismatch');item.sumVerified=true;
  async function visit(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const full=join(dir,ent.name);if(ent.isSymbolicLink())throw Error('Symlink in verified module');if(ent.isDirectory()){if(!ent.name.startsWith('.'))await visit(full)}else if(ent.isFile()&&/^(?:licen[sc]e|copying|notice|patents|authors|copyright)(?:[._-]|$)/i.test(ent.name)){const bytes=await readFile(full),source=relative(meta.Dir,full).replaceAll('\\','/'),path='modules/'+String(index).padStart(3,'0')+'/'+source;await mkdir(join(out,path,'..'),{recursive:true});await writeFile(join(out,path),bytes);item.files.push({path,source,sha256:sha(bytes),bytes:bytes.length})}}}
  await visit(meta.Dir);if(!item.files.some(f=>/licen[sc]e|copying/i.test(f.source)))throw Error('No license text found');item.status='collected';
 }catch(error){item.status='needs-review';item.error=String(error.message).slice(0,500)}
 console.log(item.status+' '+item.path+'@'+item.version+' '+item.files.length+' files');return item;
}
const entries=[...unique.values()].sort((a,b)=>(a.path+'@'+a.version).localeCompare(b.path+'@'+b.version)),results=[];let cursor=0;
await Promise.all(Array.from({length:4},async()=>{for(;;){const i=cursor++;if(i>=entries.length)return;results[i]=await inspect(entries[i],i)}}));
const report={schemaVersion:1,connectorVersion:pins.version,retrievedAt:new Date().toISOString(),inputModuleInventorySha256:sha(inventoryBytes),connectorManifestSha256:sha(await readFile('scripts/cloudflared-manifest.json')),scope:'Exact modules including replacement forks linked by four pinned upstream executables; verified module sums and copied notice candidates. Technical coverage, not independent legal clearance. Connector is downloaded unchanged, not bundled in npm.',modules:results,complete:results.every(r=>r.status==='collected')};
await writeFile(join(out,'inventory.json'),JSON.stringify(report,null,2)+'\n');if(!report.complete)process.exitCode=1;
