import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { NativePlatform } from '../../apps/server/src/hosting/platform/index.js';
const root=resolve('.'), guard=join(root,'tooling/niche-guard');
const available=process.platform==='darwin' && existsSync(join(root,'tooling/niche-platform.node'));
// Other host sessions may legitimately hold the same-named assertion.
const ownsAssertion=(report:string)=>report.split('\n').some(line=>new RegExp('^\\s*pid\\s+'+process.pid+'\\b').test(line)&&line.includes('Niche Out active game'));
const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean){for(let i=0;i<100;i++){if(check())return;await wait(50);}throw new Error('Native condition timed out');}
function alive(pid:number){try{return !execFileSync('/bin/ps',['-o','stat=','-p',String(pid)],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim().startsWith('Z');}catch{return false;}}
describe.skipIf(!available)('available Mac native integration',()=>{
  it('advances synchronous continuous time and releases the OS idle assertion',async()=>{
    const native=createRequire(import.meta.url)(join(root,'tooling/niche-platform.node')) as NativePlatform;
    const before=native.now();await wait(30);expect(native.now()-before).toBeGreaterThanOrEqual(20);
    try{expect(native.setActive(true)).toBe(true);const report=execFileSync('/usr/bin/pmset',['-g','assertions'],{encoding:'utf8'});expect(ownsAssertion(report)).toBe(true);}finally{native.setActive(false);}
    await until(()=>!ownsAssertion(execFileSync('/usr/bin/pmset',['-g','assertions'],{encoding:'utf8'})));
  });
  it.each(['eof','parent-kill'] as const)('reaps owned connector descendants after %s',async(mode)=>{
    const dir=mkdtempSync(join(tmpdir(),'niche-platform-'));
    // Fixture behaves like a connector with a child; production uses the same guard.
    const childCode=`const {spawn}=require('node:child_process');const fs=require('node:fs');const grand=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],JSON.stringify([process.pid,grand.pid]));setInterval(()=>{},1000);`;
    const marker=join(dir,'pids.json');
    const parentCode=`const {spawn}=require('node:child_process');const p=spawn(process.argv[1],[process.execPath,'-e',process.argv[3],process.argv[2]],{stdio:['pipe','ignore','ignore','pipe']});p.stdio[3].on('data',b=>require('node:fs').writeFileSync(process.argv[2]+'.connector',b));process.stdin.on('end',()=>p.stdin.end());process.stdin.resume();p.on('exit',()=>process.exit(0));`;
    const owner=spawn(process.execPath,['-e',parentCode,guard,marker,childCode],{stdio:['pipe','ignore','pipe']});
    let pids:number[]=[];
    try{await until(()=>existsSync(marker)&&existsSync(marker+'.connector'));pids=JSON.parse(readFileSync(marker,'utf8'));expect(Number(readFileSync(marker+'.connector','utf8').trim())).toBe(pids[0]);expect(pids.every(alive)).toBe(true);if(mode==='eof')owner.stdin.end();else owner.kill('SIGKILL');await until(()=>pids.every(pid=>!alive(pid)));}
    finally{owner.kill('SIGKILL');for(const pid of pids)try{process.kill(pid,'SIGKILL');}catch{}rmSync(dir,{recursive:true,force:true});}
  });
});
