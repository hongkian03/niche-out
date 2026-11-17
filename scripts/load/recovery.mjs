// Faults target only this production app, owned relay and optional Quick Tunnel.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { request, Agent } from 'node:http';
import { request as secureRequest } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { io } from 'socket.io-client';
import { createGameApplication } from '../../apps/server/dist/game/application.js';
import { HostingManager } from '../../apps/server/dist/hosting/manager.js';
import { startConnector } from '../../apps/server/dist/hosting/connector.js';
import { gameHostingStatus } from '../../apps/server/dist/game/hosting-status.js';
import { createRecoveryRelay } from './recovery-relay.mjs';
import { sanitizeDiagnostic } from './sanitize.mjs';
const option=name=>process.argv.find(x=>x.startsWith('--'+name+'='))?.slice(name.length+3);
const tunnel=process.argv.includes('--tunnel'), count=Number(option('players')??100);
assert(Number.isInteger(count)&&count>=4&&count<=100);
const directory=option('out-dir')??'work/recovery/'+Date.now();await mkdir(directory,{recursive:true});
const report={status:'RUNNING',started:new Date().toISOString(),scope:'Production clients through owned TCP relay. Relay cut models complete bidirectional app-transport loss, not OS internet loss. Optional owned cloudflared SIGKILL tests terminal Quick Tunnel policy; no same-URL crash recovery claimed.',config:{players:count,tunnel,uplink:option('uplink')??'not-recorded'},build:JSON.parse(await readFile('build/manifest.json')),checks:[],timeline:[],disconnects:0};
const started=performance.now(), mark=(label,detail={})=>{report.checks.push(label);report.timeline.push({label,atMs:performance.now()-started,...detail});console.log('PASS '+label);};
let app,relay,manager,connector,base,origin,host,players=[],all=[];
const agent=new Agent({lookup:(_host,options,cb)=>cb(null,options.all?[{address:'127.0.0.1',family:4}]:'127.0.0.1',4)});
const headers=cookie=>({Host:new URL(origin).host,Origin:origin,...(cookie?{Cookie:cookie}:{})});
async function http(path,body,cookie='',lose=false){return new Promise((resolve,reject)=>{
 const bytes=body===undefined?undefined:JSON.stringify(body),url=new URL(base+path);
 const req=(url.protocol==='https:'?secureRequest:request)(url,{method:bytes===undefined?'GET':'POST',headers:{...headers(cookie),...(bytes?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bytes)}:{})}},res=>{
  if(lose){res.on('error',()=>{});res.destroy();reject(new Error('Injected response loss after headers, before body'));return;}
  const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks)),cookie:res.headers['set-cookie']?.[0]?.split(';')[0]??cookie}));
 });req.on('error',reject);req.setTimeout(15000,()=>req.destroy(new Error('HTTP timed out')));req.end(bytes);
});}
function envelope(c,payload={},extra={}){return {protocolVersion:2,serverInstanceId:c.discovery.serverInstanceId,tabId:c.discovery.tabId,requestId:c.discovery.requestPrefix+'.'+(++c.sequence),gameId:c.gameId,payload,...extra};}
async function connectClient(c){
 if(c.socket){c.socket.removeAllListeners();c.socket.disconnect();c.socket.io.disconnect();}
 const socket=c.socket=io(tunnel?base:origin.replace('https:','http:'),{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],...(!tunnel?{agent}:{}),extraHeaders:headers(c.cookie),auth:{protocolVersion:2,serverInstanceId:c.discovery.serverInstanceId,tabId:c.discovery.tabId},timeout:10000});
 socket.on('state.changed',v=>c.view=v);socket.on('state.snapshot',v=>c.view=v);socket.on('disconnect',()=>report.disconnects++);
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);socket.connect();});
}
async function browser(oldCookie='',owner=false){const r=await http(owner?'/api/owner/exchange':'/api/session',owner?{protocolVersion:2,token:app.mintOwnerLink().split('#')[1]}:{protocolVersion:2,page:{kind:'fresh'}},oldCookie);assert.equal(r.status,200);const c={cookie:r.cookie,discovery:r.body,sequence:0,gameId:r.body.membership?.gameId??r.body.hostGameId??null,control:0};all.push(c);await connectClient(c);return c;}
const send=(c,name,input=envelope(c))=>new Promise((resolve,reject)=>c.socket.timeout(2000).emit(name,input,(error,value)=>error?reject(error):resolve(value)));
const state=async c=>{const r=await send(c,'state.get');assert.equal(r.outcome,'STATE',JSON.stringify(r));return r.view;};
async function until(test,ms=45000){const end=Date.now()+ms;while(!await test()){if(Date.now()>end)throw new Error('Recovery condition timed out');await delay(50);}}
async function batches(items,fn,width=10){for(let i=0;i<items.length;i+=width)await Promise.all(items.slice(i,i+width).map(fn));}
const pack={schemaVersion:1,title:'S03 scoped recovery',settings:{readingSeconds:0.2,answerSeconds:30,resultsSeconds:1},tiers:[{id:'rare',name:'Rare',points:100}],prompts:[1,2].map(i=>({id:'r'+i,text:'Submit Amber.',answers:[{text:'Amber',aliases:['Gold'],tierId:'rare'}]}))};
const answerInput=c=>envelope(c,{text:'Gold'},{roundId:c.view.roundId,controlGeneration:c.control});
const resolveOperation=(kind,original)=>http('/api/host/operations/resolve',{protocolVersion:2,operation:{kind,original}},host.cookie);
async function commit(lose=false){
 const staged=await http('/api/host/import',pack,host.cookie);assert.equal(staged.status,200);
 const {gameId,payload,...context}=envelope(host),original={...context,candidateId:staged.body.candidateId,expectedGameId:staged.body.expectedGameId,expectedSetupGeneration:staged.body.expectedSetupGeneration};let result;
 if(lose){await assert.rejects(http('/api/host/games',original,host.cookie,true),/Injected/);const recovered=await resolveOperation('game.commit',original);assert.equal(recovered.body.outcome,'APPLIED');result=recovered.body.result;}
 else result=(await http('/api/host/games',original,host.cookie)).body;
 assert.equal(result.outcome,'COMMITTED');host.gameId=result.gameId;assert.equal((await http('/api/host/games',original,host.cookie)).body.gameId,result.gameId);return state(host);
}
async function cleanup(){for(const c of all){c.socket?.disconnect();c.socket?.io.disconnect();}agent.destroy();await manager?.stop();if(!manager){await relay?.close();await app?.close();}}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>void cleanup().finally(()=>process.exit(130)));
try{
 const create=async(id,token)=>{app=await createGameApplication(id,token,{port:0});relay=await createRecoveryRelay(app.port);return {...app,port:relay.port,close:async()=>{await relay.close();await app.close();}};};
 if(tunnel){manager=new HostingManager({createApplication:create,connectorFactory:async(...args)=>connector=await startConnector(...args)});manager.subscribe(s=>app?.setHostingStatus(gameHostingStatus(s)));await manager.start();assert.equal(manager.snapshot().status,'ready');origin=base=manager.snapshot().publicOrigin;}
 else{await create('recovery-runtime','private-health');origin='https://recovery.example.com:'+relay.port;base='http://127.0.0.1:'+relay.port;app.configureOrigin(origin);app.setHostingStatus({status:'ready',publicOrigin:origin});}
 host=await browser('',true);const lobby=await commit(true);mark('Lost create response resolves APPLIED and exact replay retains one lobby');
 await batches(Array.from({length:count},(_,i)=>i),async i=>{const p=await browser(),joined=await send(p,'game.join',envelope(p,{code:lobby.invitation.code,nickname:'R'+i}));assert.equal(joined.outcome,'JOINED');p.gameId=host.gameId;p.control=joined.control.controlGeneration;players[i]=p;});
 assert.equal((await state(host)).roster.length,count);mark(count+' admitted identities active before combined faults');
 const startInput=envelope(host);host.socket.emit('game.start',startInput,()=>{});await until(()=>players.every(p=>p.view?.phase==='Answering'));assert.equal((await resolveOperation('game.start',startInput)).body.outcome,'APPLIED');mark('Unobserved Start acknowledgement resolves APPLIED without starting twice');
 const halfway=Math.floor(count/2);await Promise.all(players.slice(0,halfway).map(async p=>assert.equal((await send(p,'answer.submit',answerInput(p))).outcome,'ACCEPTED')));
 const before=await state(host),deadline=before.phaseDeadlineMs;relay.setOnline(false);await until(()=>all.every(c=>!c.socket.connected));await delay(3000);relay.setOnline(true);
 await connectClient(host);await batches(players,async p=>{await connectClient(p);const resumed=await send(p,'game.resume',envelope(p,{mode:'loaded'}));assert.equal(resumed.outcome,'RESUMED');assert.equal(resumed.control.controlGeneration,p.control);});
 const after=await state(host);assert.equal(after.phase,'Answering');assert.equal(after.phaseDeadlineMs,deadline);assert(after.serverNowMs>before.serverNowMs+2500);for(const p of players.slice(0,halfway))assert((await state(p)).ownAnswer.locked);mark('Every transport cut and restored: identities, locks, control and original deadline preserved',{outageMs:after.serverNowMs-before.serverNowMs});
 await Promise.all(players.slice(halfway).map(async p=>assert.equal((await send(p,'answer.submit',answerInput(p))).outcome,'ACCEPTED')));await until(()=>players.every(p=>p.view?.phase==='Answering'&&p.view.roundIndex===1));
 const original=players[0],other=await browser(original.cookie);const lostOriginal=new Promise(resolve=>original.socket.once('disconnect',resolve));const grant=await send(other,'game.resume',envelope(other,{mode:'bootstrap'}));assert.equal(grant.outcome,'RESUMED');other.control=grant.control.controlGeneration;await lostOriginal;await connectClient(original);assert.equal((await send(original,'answer.submit',answerInput(original))).code,'TAB_SUPERSEDED');const lostOther=new Promise(resolve=>other.socket.once('disconnect',resolve));const reclaim=await send(original,'player.claimControl',envelope(original,{explicit:true}));assert.equal(reclaim.outcome,'CONTROL_GRANTED');original.control=reclaim.control.controlGeneration;await lostOther;mark('Takeover fences old control under load; explicit reclaim preserves identity and score');
 const target=players.at(-1),roster=(await state(host)).roster,playerId=roster.find(p=>p.nickname==='R'+(count-1)).playerId,removeInput=envelope(host,{targetPlayerId:playerId});const removed=new Promise(resolve=>target.socket.once('disconnect',resolve));host.socket.emit('player.remove',removeInput,()=>{});await removed;assert.equal((await resolveOperation('player.remove',removeInput)).body.outcome,'APPLIED');assert.equal((await state(host)).roster.length,count-1);mark('Unobserved removal acknowledgement resolves exactly once; other players remain');
 const stale=answerInput(original);await Promise.all(players.slice(0,-1).map(async p=>assert.equal((await send(p,'answer.submit',p===original?stale:answerInput(p))).outcome,'ACCEPTED')));await until(()=>host.view?.phase==='Finished');const finished=await state(host);assert.equal(finished.standings.length,count-1);assert(finished.standings.every(row=>row.publishedTotal===200));mark('Combined-fault game finishes with exact 200-point totals for every remaining player');
 const oldGame=host.gameId;await commit(true);assert.notEqual(host.gameId,oldGame);await connectClient(original);assert.equal((await send(original,'answer.submit',stale)).code,'WRONG_GAME');assert.equal((await state(host)).roster.length,0);mark('Replacement discards old roster and fences delayed old-game mutation');
 if(tunnel){assert(connector.pid);const failure=new Promise(resolve=>{const off=manager.subscribe(s=>{if(s.status==='failed'){off();resolve(s);}});});process.kill(connector.pid,'SIGKILL');let crashTimer;const failed=await Promise.race([failure,new Promise((_,reject)=>{crashTimer=setTimeout(()=>reject(new Error('Connector crash did not fail hosting')),15000);})]).finally(()=>clearTimeout(crashTimer));assert.equal(failed.reason,'connector-exited');assert.equal(failed.publicOrigin,null);assert(app.hasDisposableState());mark('Actual owned connector SIGKILL makes hosting terminal and hides obsolete origin');await manager.stop();assert.equal(manager.snapshot().status,'idle');assert.equal(manager.application,null);mark('Stop disposes failed Quick Tunnel application; same-URL resurrection is not claimed');}
 report.status='PASS';report.finalDiagnostics=app.diagnosticSnapshot();
}catch(error){report.status='FAIL';report.error=sanitizeDiagnostic(error.stack??error.message);process.exitCode=1;console.error('FAIL '+report.error);}
finally{try{await cleanup();if(app){report.afterCleanup=app.diagnosticSnapshot().metadata;assert.equal(report.afterCleanup.sessions.records,0);assert.equal(report.afterCleanup.ledger.scopes,0);assert.equal(report.afterCleanup.ledger.pinned,0);}}catch(error){report.cleanupError=sanitizeDiagnostic(error.message);report.status='FAIL';process.exitCode=1;}report.ended=new Date().toISOString();report.elapsedMs=performance.now()-started;await writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,directory,error:report.error},null,2));}
