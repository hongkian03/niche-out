// npm's JavaScript CLI is portable; .cmd files are not direct executables.
import {execFileSync} from 'node:child_process';
import {existsSync,realpathSync} from 'node:fs';
import {dirname,join,basename} from 'node:path';
export function npmCliPath({execPath=process.execPath,npmExecPath=process.env.npm_execpath}={}) {
 const node=realpathSync(execPath),directory=dirname(node);
 const candidates=[npmExecPath,join(directory,'node_modules/npm/bin/npm-cli.js'),join(directory,'../lib/node_modules/npm/bin/npm-cli.js')];
 const path=candidates.find(path=>typeof path==='string'&&basename(path)==='npm-cli.js'&&existsSync(path));
 if(!path)throw new Error('Cannot locate npm-cli.js beside the selected Node runtime. Use the official supported Node installation with npm.');
 return realpathSync(path);
}
export function runNpm(args,options={}) {
 return execFileSync(process.execPath,[npmCliPath(),...args],options);
}
