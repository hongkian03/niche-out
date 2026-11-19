import {createHash} from 'node:crypto';
import {readdir,lstat,readFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
export const targets=['darwin-arm64','darwin-x64','win32-x64','linux-x64'];
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function productionPaths(lock) {
  return Object.entries(lock.packages).filter(([path,p])=>path.startsWith('node_modules/')&&!p.dev&&!p.link).map(([path])=>path).sort();
}
export async function inventory(root) {
 const files=[];
 async function visit(dir){for(const name of (await readdir(dir)).sort()){
  const path=join(dir,name),s=await lstat(path);
  if(s.isSymbolicLink())throw new Error('Portable resources must not contain symlinks: '+path);
  if(s.isDirectory())await visit(path);
  else if(s.isFile())files.push({path:relative(root,path).split('\\').join('/'),sha256:sha256(await readFile(path))});
  else throw new Error('Unexpected resource type: '+path);
 }}await visit(root);return files;
}
export function launchers(target) {
 if(!targets.includes(target))throw new Error('Unsupported target '+target);
 if(target==='win32-x64')return {'Start Niche Out.cmd':'@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nset "NICHE_PORTABLE=1"\r\nset "NODE_OPTIONS="\r\nset "NODE_PATH="\r\nset "CLOUDFLARED_PATH="\r\n"%~dp0runtime\\node.exe" "%~dp0scripts\\portable-start.mjs"\r\nif errorlevel 1 pause\r\n'};
 const script='#!/bin/sh\nset -eu\ncd -- "$(dirname -- "$0")"\nunset NODE_OPTIONS NODE_PATH CLOUDFLARED_PATH\nexport NICHE_PORTABLE=1\nexec "./runtime/node" "./scripts/portable-start.mjs"\n';
 return {[target.startsWith('darwin')?'Start Niche Out.command':'start-niche-out.sh']:script};
}

// Retained for historical archive verification; npm auditing uses tarball integrity.
export function parseChecksum(text, expectedName) {
 const match=/^([a-f0-9]{64}) [ *]([^\r\n]+)\r?\n?$/u.exec(text);
 if(!match||match[2]!==expectedName)throw Error('Invalid or mismatched checksum sidecar');
 return match[1];
}
