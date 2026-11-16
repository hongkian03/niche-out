import { expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import { createController, type ManagedHosting } from '../../apps/server/src/hosting/controller.js';

it('isolates local lifecycle authority, fences sessions, and protects state loss', async () => {
  let status = 'idle', sessionId: string | null = null, disposed = false, starts = 0, time=1000;
  const manager: ManagedHosting = {
    snapshot: () => ({status,sessionId,publicOrigin:status==='ready'?'https://test.example':null}),
    async start(){starts++;status='ready';sessionId='session-1';}, async stop(){status='idle';sessionId=null;disposed=true;},
    get application(){return sessionId ? {mintOwnerLink:()=> 'https://test.example/owner#private',hasDisposableState:()=>true}:null;}
  };
  const controller = await createController(manager,{now:()=>time});
  const call = (path:string,method='GET',input?:unknown,cookie?:string,origin:string|undefined=controller.origin) => fetch(controller.origin+path,{method,headers:{...(origin?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),'Content-Type':'application/json'},body:input===undefined?undefined:JSON.stringify(input)});
  try {
    expect((await call('/control/state')).status).toBe(401);
    expect((await call('/control/start','POST',{})).status).toBe(401);
    const access = controller.accessUrl(); const token = new URLSearchParams(new URL(access).hash.slice(1)).get('access');
    expect((await call('/control/exchange','POST',{token},undefined,'https://attacker.example')).status).toBe(403);
    const exchanged = await call('/control/exchange','POST',{token});expect(exchanged.status).toBe(200);
    const cookie=exchanged.headers.get('set-cookie')!.split(';')[0];expect(exchanged.headers.get('set-cookie')).toContain('HttpOnly');
    expect((await call('/control/exchange','POST',{token})).status).toBe(401);
    expect((await call('/control/start','POST',{},cookie)).status).toBe(202);
    expect(starts).toBe(1);
    const view = await (await call('/control/state','GET',undefined,cookie)).json();expect(view.publicOrigin).toBe('https://test.example');expect(JSON.stringify(view)).not.toContain('private');
    const qr=await call('/control/qr','GET',undefined,cookie);expect(qr.headers.get('content-type')).toBe('image/svg+xml');expect(await qr.text()).toContain('<svg');
    expect((await call('/control/qr?v=retired','GET',undefined,cookie)).status).toBe(409);
    expect((await call('/control/finish','POST',{sessionId:'old',confirm:true},cookie)).status).toBe(409);
    expect((await call('/control/finish','POST',{sessionId},cookie)).status).toBe(409);expect(disposed).toBe(false);
    expect((await call('/control/owner-link','POST',{sessionId},cookie)).status).toBe(200);
    status='reconnecting';expect((await(await call('/control/state','GET',undefined,cookie)).json()).publicOrigin).toBe(null);
    expect((await call('/control/qr','GET',undefined,cookie)).status).toBe(409);
    expect((await call('/control/owner-link','POST',{sessionId},cookie)).status).toBe(409);
    expect((await call('/control/finish','POST',{sessionId,confirm:true},cookie)).status).toBe(200);
    expect(disposed).toBe(true);
    const expired = new URLSearchParams(new URL(controller.accessUrl()).hash.slice(1)).get('access');time+=60_000;
    expect((await call('/control/exchange','POST',{token:expired})).status).toBe(401);
    expect((await fetch(controller.origin+'/control/start',{method:'POST',headers:{Cookie:cookie},body:'{}'})).status).toBe(403);
    const wrongHost = await new Promise<number>(resolve => { const req = httpRequest(controller.origin+'/control/state',{headers:{Host:'attacker.example',Cookie:cookie}}, res => {res.resume();resolve(res.statusCode!);});req.end(); });
    expect(wrongHost).toBe(403);
  } finally {await controller.close();}
});

it('rejects a concurrent start as soon as quit is accepted, including its response grace period', async () => {
  let release!: () => void, stopping = false, starts = 0;
  const manager: ManagedHosting = {
    snapshot: () => ({status:stopping?'idle':'ready',sessionId:stopping?null:'current',publicOrigin:'https://test.example'}),
    async start(){ starts++; },
    stop(){ stopping=true;return new Promise<void>(resolve=>{release=resolve;}); },
    application:null
  };
  const controller=await createController(manager);
  const token=new URLSearchParams(new URL(controller.accessUrl()).hash.slice(1)).get('access');
  const post=(path:string,value:unknown,cookie?:string)=>fetch(controller.origin+path,{method:'POST',headers:{Origin:controller.origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:JSON.stringify(value)});
  try {
    const auth=await post('/control/exchange',{token});const cookie=auth.headers.get('set-cookie')!.split(';')[0];
    const quit=post('/control/quit',{sessionId:'current'},cookie);
    while(!stopping) await new Promise(resolve=>setTimeout(resolve,1));
    expect((await post('/control/start',{},cookie)).status).toBe(409);
    release();expect((await quit).status).toBe(200);
    expect((await post('/control/start',{},cookie)).status).toBe(409);
    expect(starts).toBe(0);
  } finally {await controller.close();}
});
