import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,copyFile,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const require=createRequire(import.meta.url);
const runtime=require('../../bin/runtime.cjs');
const mac={node:'24.22.3',platform:'darwin',arch:'arm64',release:'24.0.0'};
test('supported runtime range and exact target/OS floor fail before native loading',()=>{
 for(const version of ['24.22.3','24.22.4','24.23.0','24.100.0'])assert(runtime.runtimeSupported(version));
 for(const version of ['22.23.0','24.22.2','25.0.0','26.0.0','24.22.3-rc.1','garbage'])assert(!runtime.runtimeSupported(version));
 assert.equal(runtime.checkRuntime(mac),'darwin-arm64');
 assert.equal(runtime.checkRuntime({...mac,arch:'x64'}),'darwin-x64');
 assert.throws(()=>runtime.checkRuntime({...mac,release:'23.6.0'}),/macOS 15/);
 assert.throws(()=>runtime.checkRuntime({...mac,arch:'ia32'}),/Unsupported/);
 assert.equal(runtime.checkRuntime({...mac,platform:'win32',arch:'x64',release:'10.0.22000'}),'win32-x64');
 assert.throws(()=>runtime.checkRuntime({...mac,platform:'win32',arch:'x64',release:'10.0.19045'}),/Windows 11/);
 assert.throws(()=>runtime.checkRuntime({...mac,platform:'win32',arch:'arm64'}),/Unsupported/);
});
test('Linux requires explicitly supported distribution and glibc, not merely linux/x64',()=>{
 const linux={node:'24.22.3',platform:'linux',arch:'x64',release:'6.8.0',linux:{ID:'ubuntu',VERSION_ID:'24.04',glibc:'2.39'}};
 assert.equal(runtime.checkRuntime(linux),'linux-x64');
 for(const replacement of [{ID:'alpine',VERSION_ID:'3.22'},{ID:'ubuntu',VERSION_ID:'22.04',glibc:'2.35'},{ID:'debian',VERSION_ID:'13',glibc:'2.41'},{ID:'ubuntu',VERSION_ID:'24.04',glibc:'2.35'}])assert.throws(()=>runtime.checkRuntime({...linux,linux:replacement}),/requires glibc|supports Ubuntu/);
 assert.deepEqual(runtime.osReleaseFields('ID=ubuntu\nVERSION_ID="24.04"\nOTHER=$(bad)\n'),{ID:'ubuntu',VERSION_ID:'24.04'});
});
test('native paths select process architecture and never another package root',()=>{
 const paths=runtime.nativePaths('/read-only path/你好','darwin-x64');
 assert.equal(paths.helperPath,join('/read-only path/你好','native/darwin-x64/niche-platform.node'));
 assert(paths.guardPath.endsWith('niche-guard'));assert.equal(runtime.nativePaths('/pkg','win32-x64').guardPath,undefined);
 assert.throws(()=>runtime.nativePaths('/pkg','linux-arm64'),/Unsupported/);
});
test('ancestor capture follows wrapper tree without reading/logging command lines',()=>{
 const calls=[];
 assert.deepEqual(runtime.ancestorPids({parent:42,platform:'darwin',execute:(file,args)=>{calls.push([file,args]);return args.at(-1)==='42'?'  40\n':' 1\n';}}),[42,40]);
 assert(calls.every(row=>row[1][1]==='ppid='));
 assert.deepEqual(runtime.ancestorPids({parent:42,platform:'win32',execute:()=> '[42,40]'}),[42,40]);
 assert.throws(()=>runtime.ancestorPids({parent:42,platform:'win32',execute:()=>'{invalid'}),/Cannot verify/);
});
test('help and version from unrelated CWD require no native helper or downloads',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'niche cli 你好-'));
 try{
  await mkdir(join(dir,'bin'));for(const name of ['niche-out.cjs','runtime.cjs'])await copyFile(new URL('../../bin/'+name,import.meta.url),join(dir,'bin',name));
  await writeFile(join(dir,'package.json'),JSON.stringify({version:'9.8.7',type:'module'}));
  for(const [arg,pattern]of [['--help',/Usage: niche-out/],['--version',/^9\.8\.7\s*$/]]){
   const result=await command(process.execPath,[join(dir,'bin/niche-out.cjs'),arg],{cwd:tmpdir(),env:{...process.env,NICHE_CACHE_DIR:join(dir,'must-not-create')}});
   assert.equal(result.code,0,result.stderr);assert.match(result.stdout,pattern);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
async function command(file,args,options={}){const child=spawn(file,args,{...options,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});return{code,stdout,stderr};}
async function until(fn,ms=10000){const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw new Error('fixture condition timed out');await delay(50);}}
test('terminating a wrapper parent shuts down the owned CLI instead of orphaning hosting',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'niche-parent-'));let wrapper,cli;
 try{
  await mkdir(join(dir,'bin'));await mkdir(join(dir,'apps/server/dist/hosting'),{recursive:true});
  for(const name of ['niche-out.cjs','runtime.cjs'])await copyFile(new URL('../../bin/'+name,import.meta.url),join(dir,'bin',name));
  await writeFile(join(dir,'package.json'),JSON.stringify({version:'0.1.0',type:'module'}));
  const ready=join(dir,'ready.json'),closed=join(dir,'closed');
  await writeFile(join(dir,'apps/server/dist/hosting/launch.js'),`import fs from 'node:fs'; export async function launchHosting(){const timer=setInterval(()=>{},1000);fs.writeFileSync(${JSON.stringify(ready)},JSON.stringify({pid:process.pid}));return {shutdown:async()=>{clearInterval(timer);fs.writeFileSync(${JSON.stringify(closed)},'closed')}};}`);
  wrapper=spawn(process.execPath,['-e',`const{spawn}=require('node:child_process');const child=spawn(process.execPath,[process.argv[1]],{stdio:'ignore'});child.on('exit',()=>process.exit());setInterval(()=>{},1000);`,join(dir,'bin/niche-out.cjs')],{stdio:'ignore'});
  await until(async()=>{try{cli=JSON.parse(await readFile(ready)).pid;return true}catch{return false}});
  wrapper.kill('SIGKILL');await until(async()=>{try{return await readFile(closed,'utf8')==='closed'}catch{return false}});
 }finally{wrapper?.kill('SIGKILL');if(cli)try{process.kill(cli,'SIGKILL')}catch{}await rm(dir,{recursive:true,force:true});}
});
