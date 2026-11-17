// Serial orchestration: never run capacity jobs in parallel on the same host.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const option=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const directory=resolve(root,option('out-dir')??'work/network-baseline/runs-'+Date.now());
const uplink=option('uplink')??'unconfirmed';
const localOnly=process.argv.includes('--local-only'),publicOnly=process.argv.includes('--public-only');
assert(!(localOnly&&publicOnly));
const configs=[];
if(!publicOnly){
 for(const [i,mode]of ['off','light','detailed','detailed','light','off'].entries())configs.push({label:'overhead-'+(i+1),args:['--players=100','--transport=websocket','--games=2','--rounds=5','--skip-pressure','--diagnostics='+mode]});
 configs.push({label:'local-polling',args:['--players=100','--transport=polling','--games=2','--rounds=5','--skip-pressure','--diagnostics=detailed']});
}
if(!localOnly)for(const transport of ['mixed','polling'])configs.push({label:'public-'+transport,args:['--tunnel','--players=100','--transport='+transport,'--games=1','--rounds=20','--diagnostics=detailed']});
const manifest={schemaVersion:1,started:new Date().toISOString(),directory,uplink,scope:'Baseline only; serial owned production application runs. Forced Node transports, not actual browser negotiation. Off/light/detailed overhead sequence is counterbalanced, two runs per mode.',planned:configs,results:[]};
if(process.argv.includes('--plan')){console.log(JSON.stringify(manifest,null,2));process.exit(0);}
await mkdir(directory,{recursive:true});
await writeFile(join(directory,'suite.json'),JSON.stringify(manifest,null,2)+'\n');
for(const config of configs){
 const log=join(directory,config.label+'.log');let output='';
 console.log('START '+config.label);
 const child=spawn(process.execPath,['scripts/load/run.mjs',...config.args,'--label='+config.label,'--out-dir='+directory,'--uplink='+uplink],{cwd:root,stdio:['ignore','pipe','pipe']});
 let timedOut=false,killTimer;const timeout=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),15000);},8*60*1000);
 child.stdout.on('data',b=>{output+=b.toString()});child.stderr.on('data',b=>{output+=b.toString()});
 const exit=await new Promise(resolve=>{child.once('error',error=>resolve({code:null,error:error.message}));child.once('exit',(code,signal)=>resolve({code,signal}));});clearTimeout(timeout);clearTimeout(killTimer);
 await writeFile(log,output);
 const files=(await readdir(directory)).filter(file=>file.startsWith(config.label+'-')&&file.endsWith('.json'));
 const report=files.length===1?files[0]:null;
 manifest.results.push({label:config.label,...exit,timedOut,log:config.label+'.log',report});
 await writeFile(join(directory,'suite.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('END '+config.label+' code='+exit.code+' report='+report);
}
manifest.ended=new Date().toISOString();manifest.status=manifest.results.every(run=>run.code===0)?'PASS':'FINDINGS';
await writeFile(join(directory,'suite.json'),JSON.stringify(manifest,null,2)+'\n');
const summarizer=spawn(process.execPath,['scripts/load/summarize-baseline.mjs','--dir='+directory],{cwd:root,stdio:'inherit'});await new Promise(resolve=>summarizer.once('exit',resolve));
console.log(JSON.stringify({status:manifest.status,directory},null,2));
process.exitCode=manifest.status==='PASS'?0:1;
