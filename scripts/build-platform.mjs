import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const option = name => process.argv.find(v => v.startsWith('--' + name + '='))?.slice(name.length + 3);
const target = option('target') ?? process.platform + '-' + process.arch;
if (!['darwin-arm64','darwin-x64','win32-x64','linux-x64'].includes(target)) throw new Error('Unsupported platform target: ' + target);
const headers = resolve(option('headers') ?? join(dirname(process.execPath),'../include/node'));
if (!existsSync(join(headers,'node_api.h'))) throw new Error('Node headers missing: pass --headers=/path/to/include/node');
const out = resolve(option('out') ?? join(root,'tooling/platform',target)); mkdirSync(out,{recursive:true});
const compiler = option('cc') ?? (target.startsWith('win32') ? 'cl' : 'cc');
const extra = option('cc-args') ? JSON.parse(option('cc-args')) : [];
function run(args) { const r=spawnSync(compiler,[...extra,...args],{stdio:'inherit',cwd:out}); if(r.error)throw r.error;if(r.status!==0)throw new Error('Native compilation failed'); }
const source=join(root,'packaging/native/platform.c'), guard=join(root,'packaging/native/guard.c');
const addon=join(out,'niche-platform.node');
if(target.startsWith('darwin')) {
 const args=['-arch',target.endsWith('arm64')?'arm64':'x86_64','-mmacosx-version-min=15.0','-O2','-Wall','-Wextra'];
 run([...args,'-bundle','-undefined','dynamic_lookup','-I'+headers,source,'-framework','IOKit','-framework','CoreFoundation','-o',addon]);
 run([...args,guard,'-o',join(out,'niche-guard')]);
} else if(target.startsWith('linux')) {
 run(['-O2','-Wall','-Wextra','-shared','-fPIC','-I'+headers,source,'-o',addon]);
 run(['-O2','-Wall','-Wextra',guard,'-o',join(out,'niche-guard')]);
} else {
 const lib=option('node-lib');if(!lib || !existsSync(lib))throw new Error('Windows compilation requires --node-lib=/path/to/node.lib');
 if(compiler.toLowerCase().endsWith('cl') || compiler.toLowerCase().endsWith('cl.exe')) run(['/nologo','/O2','/LD','/I'+headers,source,lib,'/link','/OUT:'+addon]);
 else run(['-O2','-shared','-I'+headers,source,lib,'-o',addon]);
}
if(target===process.platform+'-'+process.arch && !option('out')) {
 copyFileSync(addon,join(root,'tooling/niche-platform.node'));
 if(process.platform!=='win32'){copyFileSync(join(out,'niche-guard'),join(root,'tooling/niche-guard'));chmodSync(join(root,'tooling/niche-guard'),0o755);}
}
console.log('Native platform build: '+target+' -> '+out);
