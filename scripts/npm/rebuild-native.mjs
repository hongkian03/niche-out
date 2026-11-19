// Maintainer/CI only. Hosts receive prebuilds and never invoke a compiler.
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('This all-target recipe needs a macOS arm64 build host. Target-native builds may use scripts/build-platform.mjs.');
const run=(script,args=[],env=process.env)=>execFileSync(process.execPath,[join(root,script),...args],{cwd:root,stdio:'inherit',env});
run('scripts/package-toolchain.mjs');
const pin=JSON.parse(await readFile(join(root,'packaging/toolchain-manifest.json'),'utf8'));
const compiler=join(root,'tooling/package-cache','zig-aarch64-macos-'+pin.zigVersion,'zig');
const cache=resolve(root,'work/zig-npm');mkdirSync(cache,{recursive:true});
const env={...process.env,ZIG_GLOBAL_CACHE_DIR:join(cache,'global'),ZIG_LOCAL_CACHE_DIR:join(cache,'local')};
for(const target of ['darwin-arm64','darwin-x64'])run('scripts/build-platform.mjs',['--target='+target]);
run('scripts/build-platform.mjs',['--target=linux-x64','--cc='+compiler,'--cc-args='+JSON.stringify(['cc','-target','x86_64-linux-gnu.2.39'])],env);
run('scripts/build-platform.mjs',['--target=win32-x64','--cc='+compiler,'--cc-args='+JSON.stringify(['cc','-target','x86_64-windows-gnu']),'--node-lib='+join(root,'tooling/package-cache/node-win-x64.lib')],env);
run('scripts/build-native-inventory.mjs');
