import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';
import {setTimeout as delay} from 'node:timers/promises';
import {readNpmTarball} from '../../scripts/release-tar.mjs';
import {runNpm} from '../../scripts/npm/npm-command.mjs';
const checkout=process.cwd(),out=resolve('work/s12/registry');await mkdir(out,{recursive:true});
const reviewed=JSON.parse(await readFile('docs/implementation/evidence/epic6-npm-release/s10-s11/summary.json'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schemaVersion:1,status:'RUNNING',started:new Date().toISOString(),checks:[],node:process.version,target:process.platform+'-'+process.arch,scope:'Actual public npm registry metadata and independent tarball download, fresh by-name install and npm-exec with isolated caches, all packed file bytes, worker, native selection, private local dashboard and shutdown. No new public game/load/platform qualification.'};
let app;
const check=message=>{report.checks.push(message);console.log('PASS '+message)};
try{
 let response;
 for(let attempt=0;attempt<12;attempt++){response=await fetch('https://registry.npmjs.org/niche-out/0.1.0?release-readback='+Date.now(),{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});if(response.ok)break;assert.equal(response.status,404);await delay(5000)}
 assert(response.ok,'Published version not available after bounded readback');
 const version=await response.json();assert.equal(version.name,'niche-out');assert.equal(version.version,'0.1.0');assert.equal(version.dist.integrity,reviewed.artifact.integrity);
 assert(version._npmUser?.name==='hongkian03','Unexpected npm publisher');
 const rootResponse=await fetch('https://registry.npmjs.org/niche-out?release-readback='+Date.now(),{signal:AbortSignal.timeout(30000),headers:{'Cache-Control':'no-cache'}});assert(rootResponse.ok);const metadata=await rootResponse.json();assert.equal(metadata['dist-tags'].latest,'0.1.0');assert(metadata.maintainers.some(x=>x.name==='hongkian03'));check('Public version, latest tag, publisher/maintainer and npm integrity match the approved release');
 const url=new URL(version.dist.tarball);assert.equal(url.origin,'https://registry.npmjs.org');assert.equal(url.pathname,'/niche-out/-/niche-out-0.1.0.tgz');
 const download=await fetch(url,{signal:AbortSignal.timeout(30000)});assert(download.ok);const bytes=Buffer.from(await download.arrayBuffer());assert.equal(hash(bytes),reviewed.artifact.sha256);assert.equal('sha512-'+createHash('sha512').update(bytes).digest('base64'),reviewed.artifact.integrity);assert.equal(bytes.length,reviewed.artifact.bytes);await writeFile(join(out,'niche-out-0.1.0.tgz'),bytes);check('Independently downloaded registry tarball is byte-identical to S10/S11 reviewed bytes');
 report.registry={name:version.name,version:version.version,publisher:version._npmUser.name,maintainers:metadata.maintainers.map(x=>x.name),tag:metadata['dist-tags'].latest,tarball:url.href,sha256:hash(bytes),integrity:version.dist.integrity,bytes:bytes.length};
 const temporary=await mkdtemp(join(tmpdir(),'niche npm public é ')),local=join(temporary,'local'),elsewhere=join(temporary,'unrelated'),cache=join(temporary,'npm-cache');await mkdir(local);await mkdir(elsewhere);await writeFile(join(local,'package.json'),JSON.stringify({name:'niche-public-smoke',private:true,type:'module'}));
 const npm=(args,cwd=elsewhere)=>runNpm(['--registry=https://registry.npmjs.org','--cache',cache,...args],{cwd,encoding:'utf8',timeout:180000,maxBuffer:5*1024**2,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});
 npm(['install','--ignore-scripts','--no-audit','--no-fund','--engine-strict','--save-exact','niche-out@0.1.0'],local);const installed=join(local,'node_modules/niche-out');report.installRoot=installed;report.temporary=temporary;
 const lock=JSON.parse(await readFile(join(local,'package-lock.json')));assert.equal(lock.packages['node_modules/niche-out'].integrity,reviewed.artifact.integrity);assert.equal(lock.packages['node_modules/niche-out'].resolved,url.href);check('Fresh isolated npm install by public name/version resolves the reviewed registry tarball with scripts disabled');
 const entries=readNpmTarball(bytes);for(const [path,entry]of entries){const installedPath=join(installed,path);assert.equal(hash(await readFile(installedPath)),hash(entry.bytes),'Installed file mismatch: '+path);if(entry.mode&0o111)assert((await stat(installedPath)).mode&0o111,'Lost executable mode: '+path)}report.installedFileCount=entries.size;check('All '+entries.size+' installed packed files match the public tarball; executable modes retained');
 const cli=join(installed,'bin/niche-out.cjs');const cliRun=arg=>execFileSync(process.execPath,[cli,arg],{cwd:elsewhere,encoding:'utf8',timeout:15000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}});assert.equal(cliRun('--version').trim(),'0.1.0');assert.match(cliRun('--help'),/Niche Out/);assert.equal(npm(['exec','--yes','--ignore-scripts','--package=niche-out@0.1.0','--','niche-out','--version']).trim(),'0.1.0');check('Installed CLI help/version and registry npm-exec work from an unrelated directory');
 const worker=new Worker(pathToFileURL(join(installed,'apps/server/dist/game/import-worker.js')),{workerData:{bytes:await readFile(join(installed,'examples/game.singapore.json'))},execArgv:[]});await new Promise((resolve,reject)=>{let compiled=false;const timer=setTimeout(()=>{void worker.terminate();reject(Error('Worker timeout'))},20000);worker.on('message',m=>{if(m.kind==='compiled')compiled=true;if(m.kind==='invalid')reject(Error('Public Singapore example rejected'))});worker.once('error',reject);worker.once('exit',code=>{clearTimeout(timer);code===0&&compiled?resolve():reject(Error('Worker failed'))})});check('Actual registry-installed worker compiles the shipped Singapore example');
 const api=await import(pathToFileURL(join(installed,'apps/server/dist/hosting/launch.js')).href);let privateUrl;app=await api.launchHosting({npmPackageRoot:installed,interactive:false,openBrowser:url=>{privateUrl=url}});assert(privateUrl);const base=new URL(privateUrl).origin;const dashboard=await fetch(base);assert.equal(dashboard.status,200);assert.match(dashboard.headers.get('content-type'),/text\/html/);assert.match(await dashboard.text(),/Niche/);check('Registry-installed resources and native helper start a private loopback hosting dashboard');
 await app.shutdown();app=undefined;await assert.rejects(fetch(base));check('Registry-installed launcher shutdown closes its private listener; no public tunnel started');
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.message).replace(/(?:https?|wss?):\/\/[^\s"')]+/gu,'[redacted URL]').slice(0,1000);process.exitCode=1;console.error('FAIL '+report.error)}
finally{await app?.shutdown();report.ended=new Date().toISOString();await writeFile(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,registry:report.registry,error:report.error},null,2))}
