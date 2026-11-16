import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(readFileSync(join(root,'packaging/toolchain-manifest.json')));
const pin=manifest[process.platform+'-'+process.arch];
if(!pin)throw new Error('Pinned cross-toolchain setup currently supports macOS arm64; native target compilers may be used elsewhere.');
const cache=join(root,'tooling/package-cache');mkdirSync(cache,{recursive:true});
function download(pin,path){
 const hash=b=>createHash('sha256').update(b).digest('hex');
 try{if(hash(readFileSync(path))===pin.sha256)return;}catch{}
 execFileSync('curl',['-fL','--retry','2','--max-time','180','-o',path+'.download',pin.url],{stdio:'inherit'});
 const bytes=readFileSync(path+'.download');if(hash(bytes)!==pin.sha256)throw new Error('Toolchain checksum mismatch');
 writeFileSync(path,bytes);unlinkSync(path+'.download');
}
const archive=join(cache,'zig-aarch64-macos-'+manifest.zigVersion+'.tar.xz');download(pin,archive);execFileSync('tar',['-xf',archive,'-C',cache]);
download(manifest.windowsNodeLibrary,join(cache,'node-win-x64.lib'));
console.log(join(cache,'zig-aarch64-macos-'+manifest.zigVersion,'zig'));
