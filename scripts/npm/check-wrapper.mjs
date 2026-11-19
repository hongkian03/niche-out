// Actual npm-exec wrapper ownership. --hosting owns one temporary public tunnel.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {connect} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {npmCliPath} from './npm-command.mjs';
const hosting=process.argv.includes('--hosting');
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const cliSignal=option('kill-cli');
if(cliSignal&&!['SIGINT','SIGTERM','SIGHUP','SIGKILL'].includes(cliSignal))throw Error('Unsupported owned CLI test signal');
const candidate=JSON.parse(await readFile(resolve('dist-npm/candidate.json')));
const tarball=resolve(option('tarball')??candidate.tarball),directory=resolve(option('out-dir')??'work/npm-wrapper');
await mkdir(directory,{recursive:true});
const temporary=await mkdtemp(join(tmpdir(),'niche npm wrapper é '));
const report={status:'RUNNING',started:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,terminationTarget:cliSignal?'installed-cli':'npm-wrapper',signal:cliSignal??'SIGKILL',tarballSha256:createHash('sha256').update(await readFile(tarball)).digest('hex'),hosting,scope:'Actual npm-exec installed tarball, isolated npm cache and unrelated CWD; Termination targets only the owned wrapper or installed CLI named in terminationTarget/signal. Optional --hosting starts one owned Quick Tunnel; default is setup only. No other-platform inference.',checks:[]};
let wrapper,cliPid,wrapperExited=false,ports=[],captured=[];
const alive=pid=>{try{process.kill(pid,0);return true}catch(error){return error.code==='EPERM'}};
async function until(fn,ms=180000){const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error('npm wrapper check timed out');await delay(100)}}
function processRows(){
 if(process.platform==='win32'){
  const text=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress'],{encoding:'utf8',timeout:15000,maxBuffer:2*1024**2,windowsHide:true,stdio:['ignore','pipe','pipe']});
  return JSON.parse(text).map(row=>({pid:row.ProcessId,parent:row.ParentProcessId,name:row.Name}));
 }
 const text=execFileSync('/bin/ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8',timeout:5000,maxBuffer:2*1024**2,stdio:['ignore','pipe','pipe']});
 return text.split('\n').flatMap(line=>{const m=/^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line);return m?[{pid:Number(m[1]),parent:Number(m[2]),name:basename(m[3])}]:[];});
}
function descendants(rows,pid){const ids=new Set([pid]);for(let n=0;n<32;n++){let changed=false;for(const row of rows)if(ids.has(row.parent)&&!ids.has(row.pid)){ids.add(row.pid);changed=true}if(!changed)break;}return rows.filter(row=>row.pid!==pid&&ids.has(row.pid));}
function listenPorts(pid){
 if(process.platform==='win32'){
  const text=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',`@(Get-NetTCPConnection -State Listen -OwningProcess ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort) | ConvertTo-Json -Compress`],{encoding:'utf8',timeout:10000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  return text?[JSON.parse(text)].flat():[];
 }
 const text=execFileSync(process.platform==='darwin'?'/usr/sbin/lsof':'lsof',['-nP','-a','-p',String(pid),'-iTCP','-sTCP:LISTEN','-Fn'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','pipe']});
 return [...new Set(text.split('\n').flatMap(line=>{const found=/^n.*:(\d+)$/.exec(line);return found?[Number(found[1])]:[]}))];
}
async function open(port){return new Promise(resolve=>{const socket=connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();resolve(true)});socket.once('error',()=>resolve(false));socket.setTimeout(1000,()=>{socket.destroy();resolve(false)});});}
try{
 const cache=join(temporary,'npm-cache'),cwd=join(temporary,'unrelated'),fakebin=join(temporary,'opener'),linkFile=join(temporary,'private-setup-link');await mkdir(cwd);await mkdir(fakebin);
 if(hosting&&process.platform==='win32')throw Error('Active wrapper hosting requires an implemented private setup handoff on Windows; NOT RUN on this target.');
 if(process.platform!=='win32')for(const name of ['open','xdg-open']){const p=join(fakebin,name);await writeFile(p,hosting?'#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.NICHE_WRAPPER_LINK_FILE,process.argv[2],{mode:0o600});\n':'#!/bin/sh\nexit 0\n');await chmod(p,0o755);}
 let output='',error='';
 wrapper=spawn(process.execPath,[npmCliPath(),'exec','--yes','--ignore-scripts','--cache',cache,'--package='+tarball,'--','niche-out'],{cwd,env:{...process.env,NICHE_WRAPPER_LINK_FILE:linkFile,PATH:fakebin+ (process.platform==='win32'?';':':') +process.env.PATH,NODE_PATH:'',NODE_OPTIONS:''},stdio:['ignore','pipe','pipe']});
 wrapper.once('exit',()=>{wrapperExited=true});wrapper.stdout.on('data',b=>{output=(output+b).slice(-8000)});wrapper.stderr.on('data',b=>{error=(error+b).slice(-8000)});
 await until(()=>{if(wrapperExited)throw Error('npm-exec exited before launcher readiness (code '+wrapper.exitCode+')');return output.includes('Niche Out hosting launcher is running.');});
 captured=descendants(processRows(),wrapper.pid);const nodes=captured.filter(row=>['node','node.exe'].includes(row.name));assert.equal(nodes.length,1,'Expected one installed Node CLI descendant');cliPid=nodes[0].pid;
 ports=listenPorts(cliPid);assert(ports.length>0,'Expected local dashboard listener');assert((await Promise.all(ports.map(open))).every(Boolean));for(const port of ports){const response=await fetch('http://127.0.0.1:'+port+'/');assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);await response.arrayBuffer();}
 report.checks.push('Actual npm-exec installed CLI serves its loopback dashboard from unrelated CWD');
 if(hosting){
  await until(async()=>{try{await readFile(linkFile);return true}catch{return false}},10000);
  const setup=new URL(await readFile(linkFile,'utf8'));await rm(linkFile,{force:true});
  const token=new URLSearchParams(setup.hash.slice(1)).get('access');assert(token,'Expected private loopback setup handoff');
  const exchange=await fetch(new URL('/control/exchange',setup),{method:'POST',headers:{Origin:setup.origin,'Content-Type':'application/json'},body:JSON.stringify({token})});assert.equal(exchange.status,200);await exchange.arrayBuffer();
  const cookie=exchange.headers.get('set-cookie')?.split(';')[0];assert(cookie,'Local controller cookie missing');
  const start=await fetch(new URL('/control/start',setup),{method:'POST',headers:{Origin:setup.origin,Cookie:cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(start.status,202);await start.arrayBuffer();
  await until(async()=>{const response=await fetch(new URL('/control/state',setup),{headers:{Cookie:cookie}});assert.equal(response.status,200);const state=await response.json();if(state.state==='failed')throw Error('Owned tunnel startup failed: '+state.error);return state.state==='ready'},330000);
  captured=descendants(processRows(),wrapper.pid);assert(captured.some(row=>row.name==='cloudflared'||row.name==='cloudflared.exe'),'Expected owned cloudflared descendant');
  ports=listenPorts(cliPid);assert(ports.length>=2,'Expected local controller and game listeners');report.checks.push('Actual installed CLI starts one verified owned Quick Tunnel through private setup');
 }
 if(cliSignal)process.kill(cliPid,cliSignal);else wrapper.kill('SIGKILL');await until(()=>wrapperExited,10000);
 // Exited children may briefly be zombies; require no live process record and no listener.
 await until(()=>{const rows=processRows();return captured.every(owned=>!rows.some(row=>row.pid===owned.pid))},15000);
 assert((await Promise.all(ports.map(open))).every(value=>!value));report.checks.push(cliSignal?cliSignal+' of installed CLI releases its listeners and owned descendants':hosting?'Killing only npm wrapper terminates installed CLI, owned connector/guard and both listeners':'Killing only npm wrapper terminates installed Node CLI and its loopback listener');
 if(!hosting){assert(!output.includes('Hosting: ready'));report.checks.push('No public hosting session or connector started');}
 report.status='PASS';report.ownedProcessCount=captured.length;report.closedListenerCount=ports.length;
}catch(error){report.status='FAIL';report.error=String(error.message).replace(/(?:https?|wss?):\/\/[^\s"']+/g,'[redacted URL]').slice(0,800);process.exitCode=1;}
finally{
 if(wrapper&&!wrapperExited){wrapper.kill('SIGTERM');await delay(1000);if(!wrapperExited)wrapper.kill('SIGKILL');}
 // IDs come only from the owned npm subtree observed during this short test.
 if(cliPid&&alive(cliPid)){
  try{process.kill(cliPid,'SIGTERM');await until(()=>!processRows().some(row=>row.pid===cliPid),10000);}catch{try{process.kill(cliPid,'SIGKILL')}catch{}}
 }
 await rm(temporary,{recursive:true,force:true}).catch(()=>{});
 report.ended=new Date().toISOString();await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
