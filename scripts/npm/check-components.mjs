// Installed worker/cache/resource qualification. Explicit preparation may download
// the pinned connector into an owned cache; no public endpoint is ever opened.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {readFile,writeFile,mkdir,mkdtemp,cp,readdir,chmod,rm,stat} from 'node:fs/promises';
import {join,resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
const option=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
const input=JSON.parse(await readFile(option('install-report')??'work/npm-install/report.json'));
const root=resolve(input.installRoot),out=resolve(option('out-dir')??'work/npm-components');await mkdir(out,{recursive:true});
const cache=await mkdtemp(join(out,'cache-')),offlineCache=await mkdtemp(join(out,'offline-'));
const report={status:'RUNNING',started:new Date().toISOString(),node:process.version,target:process.platform+'-'+process.arch,checks:[],scope:'Actual installed package worker, explicit private-cache cold/warm/offline/corrupt preparation and owned writable sibling copies for resource corruption. Original package/user cache untouched; no public endpoint or GUI.'};
const sanitize=value=>String(value).replace(/(?:https?|wss?):\/\/[^\s"')]+/gu,'[redacted URL]').slice(0,900);
const check=text=>{report.checks.push(text);console.log('PASS '+text)};
async function worker(bytes){
 const w=new Worker(pathToFileURL(join(root,'apps/server/dist/game/import-worker.js')),{workerData:{bytes},execArgv:[]});
 return await new Promise((resolve,reject)=>{let outcome;const timer=setTimeout(()=>{void w.terminate();reject(Error('Installed worker timed out'))},20000);w.on('message',m=>{if(m.kind==='compiled'||m.kind==='invalid')outcome=m.kind});w.once('error',reject);w.once('exit',code=>{clearTimeout(timer);code===0&&outcome?resolve(outcome):reject(Error('Installed worker failed'))})});
}
async function helper(packageRoot,cacheRoot,blocked=false,launch=false){
 const code=`let opened=false;(async()=>{const api=await import(${JSON.stringify(pathToFileURL(join(packageRoot,'apps/server/dist/hosting/launch.js')).href)});if(${launch}){const h=await api.launchHosting({npmPackageRoot:${JSON.stringify(packageRoot)},interactive:false,openBrowser:()=>{opened=true}});await h.shutdown();return null;}return await api.prepareHosting({npmPackageRoot:${JSON.stringify(packageRoot)},connectorCacheRoot:${JSON.stringify(cacheRoot)}});})().then(path=>{process.send({ok:true,path,opened});process.disconnect()}).catch(error=>{process.send({ok:false,opened,error:String(error.message).slice(0,900)});process.disconnect()});`;
 const blockedEnv=blocked?Object.fromEntries(['HTTPS_PROXY','https_proxy','HTTP_PROXY','http_proxy','ALL_PROXY','all_proxy'].map(k=>[k,'http://127.0.0.1:9'])):{};
 return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['-e',code],{cwd:dirname(packageRoot),env:{...process.env,NODE_OPTIONS:'',NODE_PATH:'',...blockedEnv,...(blocked?{NO_PROXY:'',no_proxy:''}:{})},stdio:['ignore','pipe','pipe','ipc']});let output='',message,errors='';
  const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Installed component helper timed out'))},150000);
  child.stdout.on('data',bytes=>output+=bytes);child.stderr.on('data',bytes=>errors+=bytes);child.on('message',m=>{message=m});child.once('error',e=>{clearTimeout(timer);reject(e)});child.once('exit',()=>{clearTimeout(timer);message?resolve({...message,output}):reject(Error('Installed helper exited without result: '+sanitize(errors)))})
 });
}
async function writable(path){
 await chmod(path,0o755);
 for(const e of await readdir(path,{withFileTypes:true})){const p=join(path,e.name);if(e.isDirectory())await writable(p);else if(e.isFile())await chmod(p,(await stat(p)).mode&0o111?0o755:0o644);}
}
let clone;
try{
 for(const name of ['game.example.json','game.five-rounds.json','game.singapore.json'])assert.equal(await worker(await readFile(join(root,'examples',name))),'compiled');
 assert.equal(await worker(Buffer.from('{"schemaVersion":1,"unexpected":"invalid"}')),'invalid');check('Actual installed worker compiles all three shipped example packs and rejects invalid JSON contract');
 const cold=await helper(root,cache);assert(cold.ok,cold.error);assert(cold.output.includes('downloading'));assert(cold.output.includes('verifying'));assert(cold.path&&!relative(cache,cold.path).startsWith('..'));check('Explicit preparation cold-downloads and verifies pinned vendor component in an owned private cache');
 const warm=await helper(root,cache,true);assert(warm.ok,warm.error);assert.equal(warm.path,cold.path);assert(!warm.output.includes('downloading'));check('Separate-process warm preparation reuses verified cache with unreachable proxy and no download');
 await writeFile(cold.path,'controlled corruption in owned test cache');const corrupt=await helper(root,cache,true);assert.equal(corrupt.ok,false);assert.equal(corrupt.opened,false);check('Corrupt owned cache cannot execute and preparation fails safely when reacquisition is blocked');
 const offline=await helper(root,offlineCache,true);assert.equal(offline.ok,false);assert.equal(offline.opened,false);check('Cold offline preparation reports safe failure without creating a public endpoint');
 for(const [label,path] of [['web asset','apps/web/dist/index.html'],['native helper','native/'+process.platform+'-'+process.arch+'/niche-platform.node']]){
  clone=await mkdtemp(join(dirname(root),'.niche-component-copy-'));await cp(root,clone,{recursive:true,dereference:false});await writable(clone);await writeFile(join(clone,path),'controlled corruption');const result=await helper(clone,cache,false,true);assert.equal(result.ok,false);assert.equal(result.opened,false);assert.match(result.error,/missing or damaged|digest/i);await rm(clone,{recursive:true,force:true});clone=undefined;check('Changed installed '+label+' is rejected before local setup or native startup');
 }
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=sanitize(error.message);process.exitCode=1;}
finally{if(clone)await rm(clone,{recursive:true,force:true}).catch(()=>{});report.ended=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
