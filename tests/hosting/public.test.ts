import { afterEach, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { randomUUID } from 'node:crypto';
import { OwnerAuthority } from '../../apps/server/src/hosting/owner.js';
import { createApplication } from '../../apps/server/src/hosting/application.js';

describe('private owner handoff',()=>{
  it('uses one-time expiring tokens and rotates only on successful exchange',()=>{
    let now=0;const owner=new OwnerAuthority(()=>now);const first=owner.mint();
    const granted=owner.exchange(first,false);if(!('credential'in granted))throw Error('expected grant');
    expect(owner.authorized(granted.credential)).toBe(true);
    expect(owner.exchange(first,false)).toEqual({error:'INVALID_BOOTSTRAP'});
    const unused=owner.mint();expect(owner.authorized(granted.credential)).toBe(true);
    const replacement=owner.mint();expect(owner.exchange(unused,false)).toEqual({error:'INVALID_BOOTSTRAP'});
    expect(owner.exchange(replacement,true)).toEqual({error:'HOST_PLAYER_CONFLICT'});
    expect(owner.authorized(granted.credential)).toBe(true);
    const recovered=owner.exchange(replacement,false);expect(recovered).toHaveProperty('credential');
    expect(owner.authorized(granted.credential)).toBe(false);
    const expired=owner.mint();now=60_000;expect(owner.exchange(expired,false)).toEqual({error:'INVALID_BOOTSTRAP'});
    owner.clear();if('credential'in recovered)expect(owner.authorized(recovered.credential)).toBe(false);
  });
});
let app: Awaited<ReturnType<typeof createApplication>> | undefined;
afterEach(async()=>{await app?.close();app=undefined;});
async function start(){app=await createApplication(randomUUID(),'public-health-nonce');app.configureOrigin('https://hosting.example');return app;}
function call(path:string, options:{method?:string;origin?:string|null;host?:string;cookie?:string;body?:unknown;raw?:Buffer}={}) {
  return new Promise<{status:number;headers:Record<string,unknown>;body:string}>((resolve,reject)=>{
    const headers:Record<string,string>={Host:options.host??'hosting.example'};
    if(options.origin!==null)headers.Origin=options.origin??'https://hosting.example';
    if(options.cookie)headers.Cookie=options.cookie;
    const req=request({host:'127.0.0.1',port:app!.port,path,method:options.method??'GET',headers},res=>{
      const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode!,headers:res.headers,body:Buffer.concat(chunks).toString()}));
    });req.on('error',reject);req.end(options.raw??(options.body?JSON.stringify(options.body):undefined));
  });
}
const getCookie=(result:{headers:Record<string,unknown>})=>(result.headers['set-cookie'] as string[])[0].split(';')[0];
it('binds health to the session, enforces ingress and keeps launcher routes private',async()=>{
  const server=await start();
  expect(JSON.parse((await call('/health',{origin:null})).body)).toMatchObject({kind:'niche-hosting-v1',healthToken:'public-health-nonce',ready:true});
  expect((await call('/health',{host:'foreign.example'})).status).toBe(403);
  expect((await call('/session',{method:'POST',origin:null,body:{}})).status).toBe(403);
  expect((await call('/session',{method:'POST',origin:'https://foreign.example',body:{}})).status).toBe(403);
  expect((await call('/api/hosting/start',{method:'POST',body:{}})).status).toBe(404);
  expect((await call('/api/owner/status')).status).toBe(401);
  expect(()=>server.configureOrigin('https://changed.example')).toThrow(/fresh application/);
});
it('protects owner exchange, refuses player promotion without consuming the token, and revokes old host cookies',async()=>{
  const server=await start();
  const initial=server.mintOwnerLink().split('#')[1];
  const host=await call('/api/owner/exchange',{method:'POST',body:{token:initial}});expect(host.status).toBe(200);
  expect((host.headers['set-cookie'] as string[])[0]).toContain('Secure; HttpOnly; SameSite=Strict');
  const hostCookie=getCookie(host);
  expect((await call('/api/owner/status',{cookie:hostCookie})).status).toBe(200);
  expect((await call('/session',{method:'POST',cookie:hostCookie,body:{protocolVersion:2,page:{kind:'fresh'}}})).status).toBe(409);
  const participant=await call('/session',{method:'POST',body:{protocolVersion:2,page:{kind:'fresh'}}});
  const participantCookie=getCookie(participant);const token=server.mintOwnerLink().split('#')[1];
  expect((await call('/api/owner/exchange',{method:'POST',cookie:participantCookie,body:{token}})).status).toBe(409);
  expect((await call('/api/owner/status',{cookie:hostCookie})).status).toBe(200);
  const recovered=await call('/api/owner/exchange',{method:'POST',body:{token}});expect(recovered.status).toBe(200);
  expect((await call('/api/owner/status',{cookie:hostCookie})).status).toBe(401);
  expect((await call('/api/owner/exchange',{method:'POST',body:{token}})).status).toBe(401);
  expect((await call('/api/owner/status',{cookie:getCookie(recovered)})).status).toBe(200);
  expect(server.hasDisposableState()).toBe(true);
});
it('keeps synthetic member control and bounded uploads separate from owner access',async()=>{
  await start();
  const boot=await call('/session',{method:'POST',body:{protocolVersion:2,page:{kind:'fresh'}}});const cookie=getCookie(boot);
  const state=JSON.parse(boot.body);const command={protocolVersion:2,serverInstanceId:state.serverInstanceId,gameId:state.membership.gameId,tabId:state.tabId,requestId:state.requestPrefix+'.1',payload:{mode:'bootstrap'}};
  const first=await call('/game.resume',{method:'POST',cookie,body:command});expect(JSON.parse(first.body).controlGeneration).toBe(1);
  expect((await call('/game.resume',{method:'POST',cookie,body:command})).body).toBe(first.body);
  expect((await call('/api/owner/status',{cookie})).status).toBe(401);
  expect((await call('/upload',{method:'POST',raw:Buffer.alloc(1)})).status).toBe(401);
  expect((await call('/upload',{method:'POST',cookie,raw:Buffer.alloc(10*1024*1024)})).status).toBe(200);
  expect((await call('/upload',{method:'POST',cookie,raw:Buffer.alloc(10*1024*1024+1)})).status).toBe(413);
  expect((await call('/session',{method:'POST',cookie,raw:Buffer.alloc(4097)})).status).toBe(413);
});
it('binds an Engine.IO transport to its authenticated browser session',async()=>{
  await start();
  const a=await call('/session',{method:'POST',body:{protocolVersion:2,page:{kind:'fresh'}}});
  const b=await call('/session',{method:'POST',body:{protocolVersion:2,page:{kind:'fresh'}}});
  const initial=await call('/socket.io/?EIO=4&transport=polling',{cookie:getCookie(a),origin:null});
  expect(initial.status).toBe(200);
  const sid=JSON.parse(initial.body.slice(1)).sid;
  expect((await call('/socket.io/?EIO=4&transport=polling&sid='+sid,{method:'POST',cookie:getCookie(b),raw:Buffer.from('2')})).status).toBe(403);
});

it('rejects malformed request targets and serves only explicitly mapped assets',async()=>{
  await start();
  expect((await call('//[')).status).toBe(400);
  expect((await call('http://[')).status).toBe(400);
  for(const path of ['/constructor','/__proto__','/toString','/owner.js/../../package.json'])expect((await call(path)).status).toBe(404);
  expect((await call('/health')).status).toBe(200);
});
