// Native execution check for the actual installed tarball; no tunnel or GUI.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const input=option('install-report')??'work/npm-install/report.json';
const report=JSON.parse(await readFile(input)),root=report.installRoot,require=createRequire(import.meta.url);
const runtime=require(join(root,'bin/runtime.cjs')),target=runtime.checkRuntime();
const native=require(runtime.nativePaths(root,target).helperPath);
const first=native.now();assert(Number.isFinite(first));assert(native.now()>=first);assert(native.ownProcess(),'Native process ownership unavailable');native.setActive(false);
const installed=await import(pathToFileURL(join(root,'apps/server/dist/hosting/launch.js')).href);assert.equal(typeof installed.launchHosting,'function');
const result={status:'PASS',target,node:process.version,osRelease:(await import('node:os')).release(),checks:['Installed npm preflight and exact native tuple','Native continuous clock and process ownership','Standalone installed server entry import'],scope:'Execution only on named runner; Windows Server CI is not physical Windows11 certification; no sleep/wake or native publisher authentication.'};
await writeFile(option('out')??input.replace(/report\.json$/,'native-report.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
