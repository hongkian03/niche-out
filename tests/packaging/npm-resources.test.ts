import {describe,it,expect} from 'vitest';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyNpmResources} from '../../apps/server/src/hosting/resources.js';
const paths=['package.json','npm-shrinkwrap.json','bin/niche-out.cjs','bin/runtime.cjs','apps/server/dist/hosting/launch.js','apps/server/dist/game/import-worker.js',
'apps/server/hosting-assets/local/index.html','apps/web/dist/index.html','scripts/cloudflared-manifest.json','native-manifest.json','LICENSE',
...['darwin-arm64','darwin-x64','win32-x64','linux-x64'].flatMap(t=>['native/'+t+'/niche-platform.node',...(!t.startsWith('win32')?['native/'+t+'/niche-guard']:[])])];
async function fixture(){const root=await mkdtemp(join(tmpdir(),'niche npm é '));const files=[];for(const path of paths){await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),'fixture '+path);files.push({path,sha256:createHash('sha256').update('fixture '+path).digest('hex')});}const manifest={schemaVersion:1,kind:'npm',version:'0.1.0',nodeRange:'>=24.22.3 <25',files};await writeFile(join(root,'resources.json'),JSON.stringify(manifest));return {root,manifest};}
describe('npm package resources',()=>{
 it('accepts complete immutable inventory via canonical installed-package symlink',async()=>{const {root}=await fixture();const alias=root+'-link';try{await symlink(root,alias);expect((await verifyNpmResources(alias,{required:true}))?.kind).toBe('npm');}finally{await rm(alias,{force:true});await rm(root,{recursive:true,force:true});}});
 it('rejects damaged worker bytes before hosting',async()=>{const {root}=await fixture();try{await writeFile(join(root,'apps/server/dist/game/import-worker.js'),'changed');await expect(verifyNpmResources(root,{required:true})).rejects.toThrow('missing or damaged');}finally{await rm(root,{recursive:true,force:true});}});
 it('rejects traversal, missing required resources and internal symlink escapes',async()=>{const {root,manifest}=await fixture();try{await writeFile(join(root,'resources.json'),JSON.stringify({...manifest,files:[{path:'../escape',sha256:'0'.repeat(64)}]}));await expect(verifyNpmResources(root)).rejects.toThrow('unsafe');await writeFile(join(root,'resources.json'),JSON.stringify({...manifest,files:manifest.files.filter(f=>f.path!=='LICENSE')}));await expect(verifyNpmResources(root)).rejects.toThrow('omits');await writeFile(join(root,'resources.json'),JSON.stringify(manifest));await rm(join(root,'LICENSE'));await symlink('/tmp',join(root,'LICENSE'));await expect(verifyNpmResources(root)).rejects.toThrow('missing or damaged');}finally{await rm(root,{recursive:true,force:true});}});
 it('requires npm manifest only when explicitly in npm mode',async()=>{const root=await mkdtemp(join(tmpdir(),'niche-dev-'));try{expect(await verifyNpmResources(root)).toBeNull();await expect(verifyNpmResources(root,{required:true})).rejects.toThrow('missing or unreadable');}finally{await rm(root,{recursive:true,force:true});}});
});
