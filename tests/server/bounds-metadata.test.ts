import {describe,it,expect,vi} from 'vitest';
import {request} from 'node:http';
import {io} from 'socket.io-client';
import {twoPromptPack} from '../fixtures/game.js';
import {GameEngine} from '@rarity/game-core';
import {createGameApplication} from '../../apps/server/src/game/application.js';
import {SessionService} from '../../apps/server/src/game/sessions.js';
import {RequestLedger} from '../../apps/server/src/game/ledger.js';

describe('private aggregate resource instrumentation',()=>{
 it('clears successful pinned outcomes and session metadata on application shutdown',async()=>{
  const app=await createGameApplication('close-instance','close-health',{port:0});
  const origin='https://close.example.com';app.configureOrigin(origin);app.setHostingStatus({status:'ready',publicOrigin:origin});
  const http=(path:string,payload:unknown,cookie='')=>new Promise<{status:number;body:any;cookie:string}>((resolve,reject)=>{
   const body=JSON.stringify(payload);
   const req=request({hostname:'127.0.0.1',port:app.port,path,method:'POST',agent:false,headers:{Host:'close.example.com',Origin:origin,Cookie:cookie,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{const chunks:Buffer[]=[];res.on('data',b=>chunks.push(b));res.once('end',()=>resolve({status:res.statusCode!,body:JSON.parse(Buffer.concat(chunks).toString()),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]??cookie}));});req.once('error',reject);req.end(body);
  });
  let socket:ReturnType<typeof io>|undefined;
  try{
   const host=await http('/api/owner/exchange',{protocolVersion:2,token:app.mintOwnerLink().split('#')[1]});expect(host.status).toBe(200);
   const imported=await http('/api/host/import',twoPromptPack(),host.cookie);expect(imported.status).toBe(200);
   const original={protocolVersion:2,serverInstanceId:'close-instance',tabId:host.body.tabId,requestId:host.body.requestPrefix+'.1',candidateId:imported.body.candidateId,expectedGameId:imported.body.expectedGameId,expectedSetupGeneration:imported.body.expectedSetupGeneration};
   const committed=await http('/api/host/games',original,host.cookie);expect(committed.status).toBe(200);
   const resolved=await http('/api/host/operations/resolve',{protocolVersion:2,operation:{kind:'game.commit',original}},host.cookie);expect(resolved.body.outcome).toBe('APPLIED');
   const player=await http('/api/session',{protocolVersion:2,page:{kind:'fresh'}});expect(player.status).toBe(200);
   socket=io('http://127.0.0.1:'+app.port,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],extraHeaders:{Host:'close.example.com',Origin:origin,Cookie:player.cookie},auth:{protocolVersion:2,serverInstanceId:'close-instance',tabId:player.body.tabId}});
   await new Promise<void>((resolve,reject)=>{socket!.once('connect',()=>resolve());socket!.once('connect_error',reject);socket!.connect();});
   const input={protocolVersion:2,serverInstanceId:'close-instance',tabId:player.body.tabId,requestId:player.body.requestPrefix+'.1',gameId:null,payload:{code:resolved.body.view.invitation.code,nickname:'Ada'}};
   const joined=await new Promise<any>((resolve,reject)=>socket!.timeout(2000).emit('game.join',input,(error:unknown,value:unknown)=>error?reject(error):resolve(value)));expect(joined.outcome).toBe('JOINED');
   expect(app.diagnosticSnapshot().metadata.ledger.pinned).toBeGreaterThanOrEqual(2);
   await app.close();
   const stats=app.diagnosticSnapshot();expect(stats.connectedSockets).toBe(0);expect(stats.metadata.sessions).toEqual({records:0,credentials:0,waiting:0,pages:0,maxPagesPerIdentity:0});expect(stats.metadata.ledger).toEqual({scopes:0,pages:0,transient:0,maxTransientPerScope:0,pinned:0});
  }finally{socket?.disconnect();await app.close();}
 });

 it('shares one immutable snapshot across aggregate membership counting',async()=>{
  const app=await createGameApplication('stats-instance','stats-health',{port:0});
  const origin='https://stats.example.com';app.configureOrigin(origin);
  try {
   for(let i=0;i<8;i++){
    const status=await new Promise<number>((resolve,reject)=>{
     const body=JSON.stringify({protocolVersion:2,page:{kind:'fresh'}});
     const req=request({hostname:'127.0.0.1',port:app.port,path:'/api/session',method:'POST',agent:false,headers:{Host:'stats.example.com',Origin:origin,'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode!));});req.once('error',reject);req.end(body);
    });
    expect(status).toBe(200);
   }
   const spy=vi.spyOn(GameEngine.prototype,'state');
   try {expect(app.diagnosticSnapshot().metadata.sessions.waiting).toBe(8);expect(spy).toHaveBeenCalledTimes(1);}finally{spy.mockRestore();}
  }finally{await app.close();}
 });

 it('counts sessions/pages without exposing credentials and without sweeping expiry',()=>{
  let now=0;const service=new SessionService({serverInstanceId:'instance',now:()=>now,membership:()=>null});
  const a=service.createGuest();service.bootstrap(a.session,{kind:'fresh'},{gameId:null,lastGameCommit:null});
  const before=service.stats();expect(before).toEqual({records:2,credentials:1,waiting:1,pages:1,maxPagesPerIdentity:1});
  expect(JSON.stringify(before)).not.toContain(a.credential);expect(JSON.stringify(before)).not.toContain(a.session.id);
  now=600001;expect(service.stats()).toEqual(before);expect(service.resolve(a.credential)).toBeNull();expect(service.stats()).toMatchObject({credentials:0,pages:0});
 });
 it('counts ledger allocations without pruning or returning request/body data',()=>{
  let now=0;const ledger=new RequestLedger({now:()=>now,rejectedLimit:2,rejectedTtlMs:10});
  const c=(n:number,pinKey?:string)=>({scope:'secret-actor',pageId:'secret-tab',requestPrefix:'secret-prefix',requestId:'secret-prefix.'+n,fingerprint:'secret-answer',gameId:'game',...(pinKey?{pinKey}:{})});
  ledger.run(c(1,'join'),()=>({outcome:'JOINED'}));for(let i=2;i<5;i++)ledger.run(c(i),()=>({code:'GAME_FULL'}));
  const before=ledger.stats();expect(before).toEqual({scopes:1,pages:1,transient:2,maxTransientPerScope:2,pinned:1});expect(JSON.stringify(before)).not.toContain('secret');
  now=10;expect(ledger.stats()).toEqual(before);expect(ledger.inspect(c(4))).toBeUndefined();expect(ledger.stats()).toMatchObject({transient:0,pinned:1});
  ledger.replaceGame();expect(ledger.stats()).toMatchObject({pinned:0,transient:0,pages:1});
 });
});
