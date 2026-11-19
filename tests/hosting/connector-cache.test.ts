import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, readFile, mkdir, rm, readdir, symlink, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer as createProxy } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { connect as connectTcp } from 'node:net';
import type { Duplex } from 'node:stream';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { transpileModule, ModuleKind, ScriptTarget } from 'typescript';
import { gzipSync } from 'node:zlib';
import { prepareConnector, connectorCacheRoot, extractConnectorArchive, downloadConnector } from '../../apps/server/src/hosting/connector-cache.js';
const cleanup: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); for (const path of cleanup.splice(0)) await rm(path, { recursive: true, force: true }); });
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'niche-cache-')); cleanup.push(directory);
  const binary = Buffer.from('fixture executable'), cacheRoot = join(directory, 'cache'), manifestPath = join(directory, 'manifest.json'), target = 'darwin-arm64';
  const manifest = { version: '2026.11.0', platforms: { [target]: { url: 'https://fixture.invalid/secret-download', bytes: binary.length, archiveSha256: sha(binary), executableSha256: sha(binary), archive: 'executable' } } };
  await writeFile(manifestPath, JSON.stringify(manifest));
  const download = vi.fn(async () => (async function* () { yield binary; })());
  const verifyVersion = vi.fn(async () => {});
  const options = { manifestPath, cacheRoot, target, download, verifyVersion };
  const entry = join(cacheRoot, 'cloudflared', manifest.version, target, sha(binary));
  return { directory, binary, manifest, options, download, verifyVersion, entry };
}
function tar(name = 'cloudflared', type = '0', body = Buffer.from('fixture executable')) {
  const header = Buffer.alloc(512);header.write(name);header.write('0000700\0',100);header.write(body.length.toString(8).padStart(11,'0')+'\0',124);header.fill(32,148,156);header.write(type,156);
  const checksum=[...header].reduce((sum,b)=>sum+b,0);header.write(checksum.toString(8).padStart(6,'0')+'\0 ',148);
  return gzipSync(Buffer.concat([header,body,Buffer.alloc(Math.ceil(body.length/512)*512-body.length),Buffer.alloc(1024)]));
}
describe('verified connector cache', () => {
  it('downloads once, atomically prepares and verifies the warm cache without network', async () => {
    const f=await fixture(), stages: string[]=[];
    const path=await prepareConnector({...f.options,onProgress:p=>stages.push(p.stage)});
    expect(await readFile(path)).toEqual(f.binary);expect(stages).toContain('downloading');expect(stages.at(-1)).toBe('verifying');
    expect(await prepareConnector(f.options)).toBe(path);expect(f.download).toHaveBeenCalledTimes(1);expect(f.verifyVersion).toHaveBeenCalledTimes(2);
    expect(await readdir(f.entry)).toEqual(['cloudflared']);
  });
  it.each([
    { label:'new version and different digest', version:'2026.12.0', binary:Buffer.from('new fixture executable') },
    { label:'new version with the same bytes', version:'2026.12.0', binary:Buffer.from('fixture executable') },
    { label:'same version with a different digest', version:'2026.11.0', binary:Buffer.from('replacement fixture executable') },
  ])('keeps an existing entry usable while preparing $label',async({version,binary})=>{
    const f=await fixture(),original=await prepareConnector(f.options),active=await open(original,'r');
    try {
      const next=structuredClone(f.manifest);next.version=version;
      Object.assign(next.platforms['darwin-arm64'],{bytes:binary.length,archiveSha256:sha(binary),executableSha256:sha(binary)});
      const manifestPath=join(f.directory,'next-manifest.json');await writeFile(manifestPath,JSON.stringify(next));
      const download=vi.fn(async()=> (async function*(){yield binary;})());
      const updated=await prepareConnector({...f.options,manifestPath,download});
      expect(updated).not.toBe(original);expect(await readFile(updated)).toEqual(binary);
      expect(await readFile(original)).toEqual(f.binary);expect(await active.readFile()).toEqual(f.binary);
      expect(await prepareConnector(f.options)).toBe(original);expect(f.download).toHaveBeenCalledTimes(1);expect(download).toHaveBeenCalledTimes(1);
    }finally{await active.close();}
  });
  it('serializes simultaneous prepares and leaves only the verified executable', async()=>{
    const f=await fixture();const paths=await Promise.all(Array.from({length:5},()=>prepareConnector(f.options)));
    expect(new Set(paths).size).toBe(1);expect(f.download).toHaveBeenCalledTimes(1);expect(await readdir(f.entry)).toEqual(['cloudflared']);
  });
  it('shares one atomic acquisition between separate Node processes',async()=>{
    const f=await fixture(), modulePath=join(f.directory,'cache.mjs'), childPath=join(f.directory,'child.mjs'), binaryPath=join(f.directory,'binary'), log=join(f.directory,'downloads');
    const source=await readFile(new URL('../../apps/server/src/hosting/connector-cache.ts',import.meta.url),'utf8');
    await writeFile(modulePath,transpileModule(source,{compilerOptions:{target:ScriptTarget.ES2023,module:ModuleKind.ESNext}}).outputText);await writeFile(binaryPath,f.binary);
    await writeFile(childPath,`import {prepareConnector} from ${JSON.stringify(pathToFileURL(modulePath).href)}; import {appendFile,readFile} from 'node:fs/promises'; await prepareConnector({manifestPath:${JSON.stringify(f.options.manifestPath)},cacheRoot:${JSON.stringify(f.options.cacheRoot)},target:'darwin-arm64',verifyVersion:async()=>{},download:async()=>{await appendFile(${JSON.stringify(log)},'download\\n');await new Promise(r=>setTimeout(r,100));return (async function*(){yield await readFile(${JSON.stringify(binaryPath)});})();}});`);
    await Promise.all(Array.from({length:4},()=>new Promise<void>((resolve,reject)=>execFile(process.execPath,[childPath],{timeout:5000},error=>error?reject(error):resolve()))));
    expect((await readFile(log,'utf8')).trim().split('\n')).toHaveLength(1);expect(await readdir(f.entry)).toEqual(['cloudflared']);
  });
  it('reacquires corrupt bytes before invoking any executable verifier',async()=>{
    const f=await fixture();const path=await prepareConnector(f.options);await writeFile(path,'corrupt');f.verifyVersion.mockClear();
    await prepareConnector(f.options);expect(await readFile(path)).toEqual(f.binary);expect(f.download).toHaveBeenCalledTimes(2);expect(f.verifyVersion).toHaveBeenCalledTimes(1);
  });
  it.each(['short','long','hash'])('rejects %s downloads without execution or a final cache file',async mode=>{
    const f=await fixture();const bytes=mode==='short'?f.binary.subarray(1):mode==='long'?Buffer.concat([f.binary,Buffer.from('extra')]):Buffer.alloc(f.binary.length);
    f.download.mockImplementation(async()=> (async function*(){yield bytes;})());
    await expect(prepareConnector(f.options)).rejects.toMatchObject({code:'connector-integrity'});expect(f.verifyVersion).not.toHaveBeenCalled();expect(await readdir(f.entry)).toEqual([]);
  });
  it('classifies network failures without disclosing URL/proxy credentials and cleans temporary files',async()=>{
    const f=await fixture();f.download.mockRejectedValue(new Error('https://user:password@secret-proxy/token'));
    await expect(prepareConnector(f.options)).rejects.toMatchObject({code:'connector-download'});
    try{await prepareConnector(f.options)}catch(error){expect(String(error)).not.toMatch(/password|secret-proxy|token/)}
    expect(await readdir(f.entry)).toEqual([]);expect(f.verifyVersion).not.toHaveBeenCalled();
  });
  it('cancels an incomplete download, releases its lock and permits retry',async()=>{
    const f=await fixture(), abort=new AbortController();let entered!:()=>void;const began=new Promise<void>(resolve=>entered=resolve);
    f.download.mockImplementation(async()=> (async function*(){entered();await new Promise<void>((_,reject)=>abort.signal.addEventListener('abort',()=>reject(abort.signal.reason),{once:true}));yield f.binary;})());
    const pending=prepareConnector({...f.options,signal:abort.signal});await began;abort.abort();await expect(pending).rejects.toMatchObject({name:'AbortError'});
    expect(await readdir(f.entry)).toEqual([]);f.download.mockImplementation(async()=> (async function*(){yield f.binary;})());await prepareConnector(f.options);
  });
  it('recovers a lock owned by a dead process without killing a process',async()=>{
    const f=await fixture();await mkdir(f.entry,{recursive:true,mode:0o700});await writeFile(join(f.entry,'prepare.lock'),JSON.stringify({pid:2147483647,nonce:'dead-owner',created:0}));
    await expect(prepareConnector(f.options)).resolves.toBe(join(f.entry,'cloudflared'));expect(await readdir(f.entry)).toEqual(['cloudflared']);
  });
  it('times out waiting on a live owner without deleting its lock',async()=>{
    const f=await fixture();await mkdir(f.entry,{recursive:true,mode:0o700});await writeFile(join(f.entry,'prepare.lock'),JSON.stringify({pid:process.pid,nonce:'other-operation',created:0}));
    await expect(prepareConnector({...f.options,timeoutMs:20})).rejects.toMatchObject({name:'TimeoutError'});expect(f.download).not.toHaveBeenCalled();expect(await readdir(f.entry)).toEqual(['prepare.lock']);
  });
  it('rejects symlink cache entries without modifying their destination',async()=>{
    const f=await fixture(),elsewhere=join(f.directory,'elsewhere');await mkdir(elsewhere);await symlink(elsewhere,f.options.cacheRoot);
    await expect(prepareConnector(f.options)).rejects.toMatchObject({code:'connector-cache'});expect(await readdir(elsewhere)).toEqual([]);expect(f.download).not.toHaveBeenCalled();
  });
  it('rejects a symlink executable before reading or executing it',async()=>{
    const f=await fixture();await mkdir(f.entry,{recursive:true,mode:0o700});const other=join(f.directory,'other');await writeFile(other,f.binary);await symlink(other,join(f.entry,'cloudflared'));
    await expect(prepareConnector(f.options)).rejects.toMatchObject({code:'connector-cache'});expect(f.download).not.toHaveBeenCalled();expect(f.verifyVersion).not.toHaveBeenCalled();
  });
  it('rejects unexpected executable versions and leaves no trusted final entry',async()=>{
    const f=await fixture();f.verifyVersion.mockRejectedValue(new Error('version mismatch'));
    await expect(prepareConnector(f.options)).rejects.toMatchObject({code:'connector-version'});expect(await readdir(f.entry)).toEqual([]);
  });
  it('uses platform-specific absolute per-user cache paths',()=>{
    expect(connectorCacheRoot('darwin',{},'/Users/Test')).toBe('/Users/Test/Library/Caches/NicheOut');
    expect(connectorCacheRoot('linux',{XDG_CACHE_HOME:'/chosen'},'/home/test')).toBe('/chosen/niche-out');
    expect(connectorCacheRoot('win32',{LOCALAPPDATA:'C:\\Users\\Test\\AppData\\Local'})).toBe('C:\\Users\\Test\\AppData\\Local\\NicheOut\\Cache');
    expect(()=>connectorCacheRoot('win32',{})).toThrow();expect(()=>connectorCacheRoot('linux',{XDG_CACHE_HOME:'relative'})).toThrow();
  });
  it('downloads through an HTTPS proxy with an explicitly trusted local CA',async()=>{
    const f=await fixture(), cert=join(f.directory,'cert.pem'), key=join(f.directory,'key.pem');
    await new Promise<void>((resolve,reject)=>execFile('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{timeout:5000},error=>error?reject(error):resolve()));
    const server=createTlsServer({key:await readFile(key),cert:await readFile(cert)},(_req,res)=>res.end(f.binary));
    const proxy=createProxy();const sockets=new Set<Duplex>();let connects=0;
    proxy.on('connect',(req,downstream,head)=>{
      connects++;const port=Number(req.url!.split(':').at(-1)),upstream=connectTcp(port,'127.0.0.1');
      for(const socket of [downstream,upstream]){sockets.add(socket);socket.on('error',()=>{downstream.destroy();upstream.destroy()});socket.on('close',()=>sockets.delete(socket));}
      upstream.once('connect',()=>{downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');if(head.length)upstream.write(head);downstream.pipe(upstream);upstream.pipe(downstream);});
    });
    server.listen(0,'127.0.0.1');proxy.listen(0,'127.0.0.1');await Promise.all([once(server,'listening'),once(proxy,'listening')]);
    try{
      const tlsPort=(server.address() as {port:number}).port,proxyPort=(proxy.address() as {port:number}).port;
      f.manifest.platforms['darwin-arm64'].url='https://localhost:'+tlsPort+'/connector';await writeFile(f.options.manifestPath,JSON.stringify(f.manifest));
      const modulePath=join(f.directory,'proxy-cache.mjs'),childPath=join(f.directory,'proxy-child.mjs');
      const source=await readFile(new URL('../../apps/server/src/hosting/connector-cache.ts',import.meta.url),'utf8');await writeFile(modulePath,transpileModule(source,{compilerOptions:{target:ScriptTarget.ES2023,module:ModuleKind.ESNext}}).outputText);
      await writeFile(childPath,`import {prepareConnector} from ${JSON.stringify(pathToFileURL(modulePath).href)}; await prepareConnector({manifestPath:${JSON.stringify(f.options.manifestPath)},cacheRoot:${JSON.stringify(f.options.cacheRoot)},target:'darwin-arm64',verifyVersion:async()=>{}});`);
      await new Promise<void>((resolve,reject)=>execFile(process.execPath,[childPath],{timeout:5000,env:{...process.env,NODE_EXTRA_CA_CERTS:cert,HTTPS_PROXY:'http://127.0.0.1:'+proxyPort,https_proxy:'',HTTP_PROXY:'',http_proxy:'',NO_PROXY:'',no_proxy:'',NODE_TLS_REJECT_UNAUTHORIZED:'1'}},error=>error?reject(error):resolve()));
      expect(connects).toBe(1);expect(await readFile(join(f.entry,'cloudflared'))).toEqual(f.binary);
    }finally{for(const socket of sockets)socket.destroy();server.closeAllConnections();proxy.closeAllConnections();await Promise.all([new Promise<void>(resolve=>server.close(()=>resolve())),new Promise<void>(resolve=>proxy.close(()=>resolve()))]);}
  });
  it('refuses disabled TLS validation before downloading',async()=>{
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED','0');await expect(downloadConnector(new URL('https://fixture.invalid'),new AbortController().signal)).rejects.toMatchObject({code:'connector-download'});
  });
  it('extracts a single regular file and rejects traversal, symlinks, corruption or extra members',()=>{
    expect(extractConnectorArchive(tar())).toEqual(Buffer.from('fixture executable'));
    for(const archive of [tar('../cloudflared'),tar('cloudflared','2'),Buffer.from('badgzip'),gzipSync(Buffer.alloc(1024))])expect(()=>extractConnectorArchive(archive)).toThrow();
  });
});
