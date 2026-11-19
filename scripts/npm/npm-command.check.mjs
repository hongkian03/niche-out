import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {npmCliPath,runNpm} from './npm-command.mjs';
test('selects npm JavaScript CLI beside Node without executing a command shim',async()=>{
 const root=await mkdtemp(join(tmpdir(),'npm command é '));try{const node=join(root,'node.exe'),cli=join(root,'node_modules/npm/bin/npm-cli.js');await writeFile(node,'fixture');await mkdir(dirname(cli),{recursive:true});await writeFile(cli,'fixture');assert.equal(npmCliPath({execPath:node,npmExecPath:join(root,'npm.cmd')}),await realpath(cli));}finally{await rm(root,{recursive:true,force:true});}
});
test('resolves Unix Node distribution layout and fails clearly without npm',async()=>{
 const root=await mkdtemp(join(tmpdir(),'npm command '));try{const node=join(root,'bin/node'),cli=join(root,'lib/node_modules/npm/bin/npm-cli.js');await mkdir(dirname(node),{recursive:true});await writeFile(node,'fixture');assert.throws(()=>npmCliPath({execPath:node,npmExecPath:null}),/Cannot locate/);await mkdir(dirname(cli),{recursive:true});await writeFile(cli,'fixture');assert.equal(npmCliPath({execPath:node,npmExecPath:null}),await realpath(cli));}finally{await rm(root,{recursive:true,force:true});}
});
test('runs selected npm through Node without a shell',()=>{assert.match(runNpm(['--version'],{encoding:'utf8',timeout:10000}),/^\d+\.\d+\.\d+/);});
