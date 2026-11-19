// Local-only qualification; no registry publication or public endpoint.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,chmod} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runNpm} from './npm-command.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const directory=resolve(option('out-dir')??'work/npm-versions');await mkdir(directory,{recursive:true});
const originalCandidate=JSON.parse(await readFile(join(root,'dist-npm/candidate.json')));
const original=resolve(option('tarball')??originalCandidate.tarball),nextVersion=option('version')??'0.1.1-test';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const temporary=await mkdtemp(join(tmpdir(),'niche version é ')),prefix=join(temporary,'prefix'),npmCache=join(temporary,'npm-cache'),cache=join(temporary,'connector-cache'),cwd=join(temporary,'unrelated');
for(const p of [prefix,cache,cwd])await mkdir(p);
const installed=join(prefix,process.platform==='win32'?'node_modules/niche-out':'lib/node_modules/niche-out');
const report={status:'RUNNING',started:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,scope:'Actual local npm tarballs; isolated user-owned global prefix/cache; current→new→explicit prior. Each local launcher stops before install. Warm connector cache seeded from verified vendor bytes. No publication/public tunnel/active-update/physical-device or other-platform certification.',checks:[],versions:[]};
const children=new Set();let current;
async function inspectProcess(code){
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['-e',code],{cwd,env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''},stdio:['ignore','pipe','pipe','ipc']});children.add(child);let error='';
  const timer=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Version launcher setup timed out'))},30000);
  child.stderr.on('data',b=>error+=b);child.once('message',message=>{clearTimeout(timer);current=child;resolve(message)});child.once('error',e=>{clearTimeout(timer);reject(e)});
  child.once('exit',status=>{children.delete(child);clearTimeout(timer);if(status)reject(Error('Version fixture failed: '+error.replace(/(?:https?|wss?):\/\/[^\s"']+/g,'[redacted URL]').slice(0,300)))});
 });
}
async function stop(child){
 if(!child)return;if(child.exitCode!==null){assert.equal(child.exitCode,0);return;}
 const exit=new Promise(resolve=>child.once('exit',resolve));if(child.connected)child.send('stop');let timer;
 await Promise.race([exit,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Version launcher shutdown timed out')),15000))]).finally(()=>clearTimeout(timer));assert.equal(child.exitCode,0);children.delete(child);
}
try{
 const originalHash=hash(await readFile(original));
 execFileSync(process.execPath,[join(root,'scripts/npm/assemble.mjs'),'--version='+nextVersion,'--out-dir='+join(directory,'next')],{cwd:root,stdio:'pipe',timeout:180000,maxBuffer:5*1024**2});
 const next=JSON.parse(await readFile(join(directory,'next/candidate.json')));assert.equal(next.version,nextVersion);assert.notEqual(nextVersion,originalCandidate.version);assert.equal(hash(await readFile(original)),originalHash,'Alternate assembly changed default candidate');
 const stages=[{name:'current',version:originalCandidate.version,tarball:original},{name:'new',version:next.version,tarball:next.tarball},{name:'prior',version:originalCandidate.version,tarball:original}];
 let seeded=false,expectedConnector,expectedDigest;const setupNonces=new Set(),processes=new Set();
 for(const stage of stages){
  runNpm(['install','--global','--prefix',prefix,'--cache',npmCache,stage.tarball,'--ignore-scripts','--no-audit','--no-fund'],{cwd,stdio:'pipe',timeout:180000});
  const manifest=JSON.parse(await readFile(join(installed,'package.json'))),resources=JSON.parse(await readFile(join(installed,'resources.json')));assert.equal(manifest.version,stage.version);assert.equal(resources.version,stage.version);
  const version=execFileSync(process.execPath,[join(installed,'bin/niche-out.cjs'),'--version'],{cwd,encoding:'utf8',timeout:10000}).trim();assert.equal(version,stage.version);
  const connector=JSON.parse(await readFile(join(installed,'scripts/cloudflared-manifest.json'))),target=process.platform+'-'+process.arch,pin=connector.platforms[target],filename=process.platform==='win32'?'cloudflared.exe':'cloudflared';assert(pin);
  const relative=['cloudflared',connector.version,target,pin.executableSha256,filename];
  if(!seeded){
   const userRoot=process.platform==='darwin'?join(homedir(),'Library/Caches/NicheOut'):process.platform==='win32'?join(process.env.LOCALAPPDATA,'NicheOut/Cache'):join(process.env.XDG_CACHE_HOME??join(homedir(),'.cache'),'niche-out');
   const source=option('connector-binary')??join(userRoot,...relative),bytes=await readFile(source);assert.equal(hash(bytes),pin.executableSha256,'Seed must match pinned vendor executable');
   await mkdir(join(cache,...relative.slice(0,-1)),{recursive:true});await copyFile(source,join(cache,...relative));await chmod(join(cache,...relative),0o700);seeded=true;
  }
  const entry=pathToFileURL(join(installed,'apps/server/dist/hosting/launch.js')).href;
  const details=await inspectProcess(`(async()=>{const api=await import(${JSON.stringify(entry)});const opts={npmPackageRoot:${JSON.stringify(installed)},connectorCacheRoot:${JSON.stringify(cache)},interactive:false};const connector=await api.prepareHosting(opts);const host=await api.launchHosting({...opts,openBrowser:url=>{const parsed=new URL(url);process.send({origin:parsed.origin,nonce:parsed.hash.slice(1),pid:process.pid,connector})}});process.on('message',async m=>{if(m==='stop'){await host.shutdown();process.disconnect()}});process.channel.unref();})().catch(e=>{console.error(e.message);process.exitCode=1});`);
  assert(!setupNonces.has(details.nonce),'Restart must create fresh private setup access');setupNonces.add(details.nonce);assert(!processes.has(details.pid));processes.add(details.pid);
  const response=await fetch(details.origin);assert.equal(response.status,200);await response.arrayBuffer();
  const digest=hash(await readFile(details.connector));assert.equal(digest,pin.executableSha256);if(expectedConnector){assert.equal(details.connector,expectedConnector);assert.equal(digest,expectedDigest)}else{expectedConnector=details.connector;expectedDigest=digest}
  await stop(current);current=undefined;
  await assert.rejects(fetch(details.origin,{signal:AbortSignal.timeout(2000)}),'Stopped launcher must release its local controller');
  report.versions.push({stage:stage.name,version,tarballSha256:hash(await readFile(stage.tarball)),resourcesVersion:resources.version,connectorSha256:digest,stoppedBeforeNextInstall:true});
 }
 report.checks.push('Actual global-prefix current→distinct new version→explicit prior installs with ignored scripts');
 report.checks.push('CLI versions match installed package/resource manifests and launch a reachable local controller');
 report.checks.push('Every launcher stops before install; fresh process/private access and released old listener verified');
 report.checks.push('All three app versions reuse unchanged verified connector cache path/bytes');
 report.checks.push('Alternate assembly preserves the original default tarball');report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.message).replace(/(?:https?|wss?):\/\/[^\s"']+/g,'[redacted URL]').slice(0,800);process.exitCode=1;}
finally{for(const child of children){try{await stop(child)}catch{child.kill('SIGKILL')}}report.ended=new Date().toISOString();await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
