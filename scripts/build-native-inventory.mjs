// Maintainer-only inventory: every shipped helper must match current native source.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const targets=['darwin-arm64','darwin-x64','win32-x64','linux-x64'];
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceSha256=sha256(Buffer.concat(await Promise.all(['platform.c','guard.c'].map(name=>readFile(join(root,'packaging/native',name))))));
const inventory={schemaVersion:1,napiVersion:8,sourceSha256,authentication:'No project publisher authentication asserted; preserve platform/linker signatures; paid publisher signing is optional',targets:{}};
for(const target of targets){
 const directory=join(root,'tooling/platform',target),built=JSON.parse(await readFile(join(directory,'build.json'),'utf8'));
 if(built.target!==target||built.napiVersion!==8||built.sourceSha256!==sourceSha256)throw new Error('Native prebuild is missing/current-source mismatch: '+target+'. Rebuild all native targets.');
 const names=['niche-platform.node',...(!target.startsWith('win32')?['niche-guard']:[])];
 inventory.targets[target]={buildNode:built.buildNode,buildHost:built.buildHost,compiler:built.compiler,executed:target===process.platform+'-'+process.arch?'requires recorded native tests':'not executed on build host',files:[]};
 for(const name of names){const digest=sha256(await readFile(join(directory,name)));if(!built.files.some(row=>row.path===name&&row.sha256===digest))throw new Error('Native prebuild digest mismatch: '+target+'/'+name);inventory.targets[target].files.push({path:'native/'+target+'/'+name,sha256:digest});}
}
const output=resolve(process.argv.find(arg=>arg.startsWith('--out='))?.slice(6)??join(root,'tooling/native-manifest.json'));
await mkdir(join(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(inventory,null,2)+'\n');console.log('Native inventory: '+output);
