// Read npm pack bytes in memory. Never extract, execute, or trust a staging tree.
import {gunzipSync} from 'node:zlib';
const MAX_BYTES=256*1024*1024;
export function safeResourcePath(path) {
  return typeof path==='string' && path.length>0 && !/[\\:\x00]/u.test(path) && path.split('/').every(part=>part && part!=='.' && part!=='..');
}
export function readNpmTarball(bytes) {
  if(bytes.length>MAX_BYTES)throw Error('Tarball exceeds audit limit');
  const tar=gunzipSync(bytes,{maxOutputLength:MAX_BYTES}),files=new Map();let offset=0,ended=false;
  const text=(header,start,length)=>header.subarray(start,start+length).toString('utf8').replace(/\0.*$/su,'');
  const octal=value=>{if(!/^[0-7]+$/u.test(value.trim()))throw Error('Invalid tar numeric field');return parseInt(value.trim(),8)};
  while(offset+512<=tar.length){
    const h=tar.subarray(offset,offset+512);
    if(h.every(b=>b===0)){if(tar.length-offset<1024 || tar.subarray(offset).some(b=>b!==0))throw Error('Invalid tar terminator');ended=true;break;}
    const checksum=octal(text(h,148,8));let sum=0;for(let i=0;i<512;i++)sum+=i>=148&&i<156?32:h[i];
    if(sum!==checksum)throw Error('Tar header checksum mismatch');
    const prefix=text(h,345,155),name=(prefix?prefix+'/':'')+text(h,0,100),type=text(h,156,1),size=octal(text(h,124,12)),mode=octal(text(h,100,8));
    if(!name.startsWith('package/'))throw Error('Tar member outside package root');
    const path=name.slice(8).replace(type==='5'?/\/$/u:/$^/u,'');
    if(!safeResourcePath(path))throw Error('Unsafe tar member path');
    if(type!=='0'&&type!==''&&type!=='5')throw Error('Unsupported tar member type (links/extensions are forbidden)');
    if(type==='5'&&size!==0)throw Error('Nonempty tar directory');
    if(!Number.isSafeInteger(size)||size<0||offset+512+size>tar.length)throw Error('Truncated tar member');
    if(files.has(path))throw Error('Duplicate tar member');
    if(type!=='5')files.set(path,{bytes:tar.subarray(offset+512,offset+512+size),mode});
    if(files.size>10000)throw Error('Too many tar members');
    offset+=512+Math.ceil(size/512)*512;
  }
  if(!ended||!files.size)throw Error('Incomplete npm tarball');
  return files;
}
