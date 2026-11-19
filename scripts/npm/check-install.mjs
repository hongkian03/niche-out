// Actual tarball installation outside the checkout. No publication or install hooks.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,chmod,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {runNpm} from './npm-command.mjs';
import {Worker} from 'node:worker_threads';
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const candidateFile=resolve(option('candidate')??'dist-npm/candidate.json');
const candidate=JSON.parse(await readFile(candidateFile));
const tarball=resolve(option('tarball')??join(dirname(candidateFile),basename(candidate.tarball))),directory=resolve(option('out-dir')??'work/npm-install');await mkdir(directory,{recursive:true});
const temporary=await mkdtemp(join(tmpdir(),'niche npm installed é '));
const cache=join(temporary,'npm-cache'),checks=[];
const npmRun=(args,cwd)=>runNpm(['--cache',cache,...args],{cwd,encoding:'utf8',timeout:180000,maxBuffer:5*1024**2,env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''}});
const local=join(temporary,'local'),prefix=join(temporary,'global'),elsewhere=join(temporary,'unrelated');for(const d of [local,prefix,elsewhere])await mkdir(d);
const report={status:'RUNNING',tarball,temporary,started:new Date().toISOString(),node:process.version,scope:'Fresh local/user-prefix-global/npm-exec installs with ignored scripts, outside checkout. Help/version and real bundled worker; hosting/browser verified separately.',checks};
try{
 await writeFile(join(local,'package.json'),JSON.stringify({name:'niche-install-smoke',private:true,type:'module'}));
 npmRun(['install',tarball,'--ignore-scripts','--no-audit','--no-fund'],local);
 const installed=join(local,'node_modules/niche-out'),manifest=JSON.parse(await readFile(join(installed,'package.json')));
 assert(!manifest.scripts,'No install lifecycle scripts');assert.equal(manifest.engines.node,'>=24.22.3 <25');
 const run=(args)=>execFileSync(process.execPath,[join(installed,'bin/niche-out.cjs'),...args],{cwd:elsewhere,encoding:'utf8',timeout:15000,env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''}});
 assert.match(run(['--help']),/Niche Out|niche-out/);assert(run(['--version']).includes(candidate.version));checks.push('local tgz install --ignore-scripts and help/version from unrelated Unicode/space path');
 const lock=JSON.parse(await readFile(join(installed,'npm-shrinkwrap.json')));assert(!Object.entries(lock.packages).some(([path,value])=>path.includes('@rarity')||value.link||value.dev));checks.push('published runtime shrinkwrap has no dev or private workspace links');
 const pack={schemaVersion:1,title:'Actual npm worker',tiers:[{id:'rare',name:'Rare',points:100}],prompts:[{id:'one',text:'Name a season.',answers:[{text:'Autumn',aliases:['Fall'],tierId:'rare'}]}]};
 const worker=new Worker(pathToFileURL(join(installed,'apps/server/dist/game/import-worker.js')),{workerData:{bytes:Buffer.from(JSON.stringify(pack))}});
 const compiled=await new Promise((resolve,reject)=>{let definition;const timeout=setTimeout(()=>{void worker.terminate();reject(Error('Worker timeout'));},10000);worker.on('message',m=>{if(m.kind==='compiled')definition=m.definition;else if(m.kind==='invalid')reject(Error('Valid fixture rejected'));});worker.once('error',reject);worker.once('exit',code=>{clearTimeout(timeout);code===0&&definition?resolve(definition):reject(Error('Worker failed '+code));});});assert(compiled);checks.push('actual bundled worker compiles accepted answers/aliases without a checkout');
 npmRun(['install','--global','--prefix',prefix,tarball,'--ignore-scripts','--no-audit','--no-fund'],elsewhere);
 const globalCli=join(prefix,process.platform==='win32'?'niche-out.cmd':'bin/niche-out');
 const globalVersion=process.platform==='win32'
  ? execFileSync(process.execPath,[join(prefix,'node_modules/niche-out/bin/niche-out.cjs'),'--version'],{cwd:elsewhere,encoding:'utf8',timeout:15000})
  : execFileSync(globalCli,['--version'],{cwd:elsewhere,encoding:'utf8',timeout:15000});
 assert(globalVersion.includes(candidate.version));if(process.platform==='win32'){assert((await readFile(globalCli,'utf8')).includes('niche-out.cjs'));report.windowsShimExecution='Actual cmd.exe/PowerShell invocation remains required on Windows; direct installed CLI executed here.';}checks.push('user-prefix global install executable shim from unrelated cwd');
 assert(npmRun(['exec','--yes','--ignore-scripts','--package='+tarball,'--','niche-out','--version'],elsewhere).includes(candidate.version));checks.push('npm-exec tarball invocation with isolated cache and ignored scripts');
 if(process.platform!=='win32'){
  async function readonly(path){for(const entry of await readdir(path,{withFileTypes:true})){const child=join(path,entry.name);if(entry.isDirectory())await readonly(child);else await chmod(child,(await stat(child)).mode&0o111?0o555:0o444);}await chmod(path,0o555);}
  await readonly(installed);assert.equal(run(['--version']).trim(),candidate.version);checks.push('installed package made read-only before hosting smoke; no package/CWD writes required');report.readOnlyPackage=true;
 } else report.readOnlyPackage='POSIX mode test not applicable; Windows ACL checks require target evidence';
 report.installRoot=installed;report.globalPrefix=prefix;report.npmCache=cache;report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.message).slice(0,1000);process.exitCode=1;}
report.ended=new Date().toISOString();await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
