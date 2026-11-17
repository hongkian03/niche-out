// Production application over real loopback HTTP/Socket.IO. Logical clock advances
// accelerate expiry/rate refill; this is not wall-clock endurance or a public flood.
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {io} from 'socket.io-client';
import {createGameApplication} from '../../apps/server/dist/game/application.js';
import {sanitizeDiagnostic} from './sanitize.mjs';

const directory=process.argv.find(x=>x.startsWith('--out-dir='))?.slice(10)??'work/bounds-runtime';
await mkdir(directory,{recursive:true});
const report={status:'RUNNING',started:new Date().toISOString(),scope:'Real compiled production server, 100 active loopback clients, full production limits. Injected monotonic logical clock accelerates expiry/refill; not an internet flood, real-time expiry wait or soak. Parent and load clients share this process; RSS is not isolated server memory.',checks:[],samples:[]};
const origin='https://bounds.example.com';let logical=0,app;const sockets=new Set();
const tick=(ms=300)=>{logical+=ms;};
function http(path,body,cookie='') {
 return new Promise((resolve,reject)=>{const bytes=body===undefined?undefined:JSON.stringify(body);const req=request({hostname:'127.0.0.1',port:app.port,path,method:body===undefined?'GET':'POST',agent:false,headers:{Host:new URL(origin).host,Origin:origin,Cookie:cookie,...(bytes===undefined?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(bytes)})}},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{const text=Buffer.concat(chunks).toString();let body;try{body=JSON.parse(text)}catch{body=text}resolve({status:res.statusCode,body,cookie:res.headers['set-cookie']?.[0]?.split(';')[0]??cookie});});});req.setTimeout(10000,()=>req.destroy(new Error('HTTP timeout')));req.on('error',reject);req.end(bytes);});
}
function envelope(c,payload={},gameId=c.gameId??null){return {protocolVersion:2,serverInstanceId:'bounds-instance',tabId:c.discovery.tabId,requestId:c.discovery.requestPrefix+'.'+(++c.seq),gameId,payload};}
function send(c,name,input=envelope(c)){return new Promise((resolve,reject)=>c.socket.timeout(3000).emit(name,input,(error,result)=>error?reject(error):resolve(result)));}
async function connect(c){const socket=c.socket=io('http://127.0.0.1:'+app.port,{autoConnect:false,forceNew:true,reconnection:false,transports:['websocket'],extraHeaders:{Host:new URL(origin).host,Origin:origin,Cookie:c.cookie},auth:{protocolVersion:2,serverInstanceId:'bounds-instance',tabId:c.discovery.tabId}});sockets.add(socket);await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('connect_error',reject);socket.connect();});return c;}
async function browser(owner=false,cookie,open=true){tick();const r=await http(owner?'/api/owner/exchange':'/api/session',owner?{protocolVersion:2,token:app.mintOwnerLink().split('#')[1]}:{protocolVersion:2,page:{kind:'fresh'}},cookie);assert.equal(r.status,200,JSON.stringify(r.body));const c={cookie:r.cookie,discovery:r.body,seq:0,gameId:null};if(open)await connect(c);return c;}
async function snapshot(c){const r=await send(c,'state.get');assert.equal(r.outcome,'STATE',JSON.stringify(r));return r.view;}
function sample(label){const stats=app.diagnosticSnapshot();report.samples.push({label,logicalMs:logical,metadata:stats.metadata,connectedSockets:stats.connectedSockets,players:stats.players,memory:process.memoryUsage()});return stats.metadata;}
function check(label){report.checks.push(label);console.log('PASS '+label);}
const pack={schemaVersion:1,title:'Runtime bounds fixture',settings:{readingSeconds:0.1,answerSeconds:600,resultsSeconds:0.1},tiers:[{id:'rare',name:'Rare',points:100}],prompts:[{id:'one',text:'Choose the fixture answer.',answers:[{text:'Amber',tierId:'rare'}]}]};
async function commit(host){tick();const staged=await http('/api/host/import',pack,host.cookie);assert.equal(staged.status,200,JSON.stringify(staged.body));const {payload,gameId,...base}=envelope(host);const input={...base,candidateId:staged.body.candidateId,expectedGameId:staged.body.expectedGameId,expectedSetupGeneration:staged.body.expectedSetupGeneration};const result=await http('/api/host/games',input,host.cookie);assert.equal(result.status,200,JSON.stringify(result.body));host.gameId=result.body.gameId;return {input,result:result.body,view:await snapshot(host)};}
async function join(c,code,nickname){tick();const input=envelope(c,{code,nickname});const result=await send(c,'game.join',input);assert.equal(result.outcome,'JOINED',JSON.stringify(result));c.gameId=result.gameId;c.control=result.control;return {input,result};}
try{
 report.build=JSON.parse(await readFile('build/manifest.json'));report.compiledServerSha256=createHash('sha256').update(await readFile('apps/server/dist/game/application.js')).digest('hex');
 app=await createGameApplication('bounds-instance','bounds-health',{port:0,now:()=>logical});app.configureOrigin(origin);app.setHostingStatus({status:'ready',publicOrigin:origin});
 const host=await browser(true),g=await commit(host),players=[];let pinned;
 for(let i=0;i<100;i++){const c=await browser();const admission=await join(c,g.view.invitation.code,'P'+i);players.push(c);if(i===0)pinned=admission;}
 const anchor=players[0];assert.equal((await snapshot(host)).roster.length,100);sample('admitted-100');check('100 active clients admitted at production capacity');
 // Waiting pool saturation and lazy expiry, while live identities remain admitted.
 for(let i=0;i<256;i++)await browser(false,undefined,false);
 tick();const overflow=await http('/api/session',{protocolVersion:2,page:{kind:'fresh'}});assert.equal(overflow.body.code,'SESSION_CAPACITY');assert.equal(sample('waiting-full').sessions.waiting,256);assert.equal((await snapshot(host)).roster.length,100);
 tick(600001);const fresh=await browser(false,undefined,false);assert.equal(sample('waiting-expired').sessions.waiting,1);assert.equal((await snapshot(anchor)).ownPlayer.nickname,'P0');check('256 waiting identities cap, expire and refill without evicting active players');
 // Controlling page plus seven live extra pages fill one identity's page slots.
 const extra=[];for(let i=0;i<7;i++)extra.push(await browser(false,anchor.cookie));
 tick();assert.equal((await http('/api/session',{protocolVersion:2,page:{kind:'fresh'}},anchor.cookie)).body.code,'PAGE_CAPACITY');assert.equal(sample('pages-full').sessions.maxPagesPerIdentity,8);
 const retired=extra[0];retired.socket.disconnect();await delay(20);await browser(false,anchor.cookie,false);
 let refusal;try{await connect(retired)}catch(error){refusal=error.data?.code}assert.equal(refusal,'UNAUTHORIZED');assert.equal((await snapshot(anchor)).ownPlayer.nickname,'P0');check('Eight live pages cap; inactive page eviction rejects retired prefix and protects controller');
 // Guest Engine.IO handshakes intentionally omit Socket.IO namespace auth.
 const raw=[];for(let i=0;i<128;i++){const r=await http('/socket.io/?EIO=4&transport=polling',undefined,host.cookie);assert.equal(r.status,200);raw.push(r.body);}
 assert.equal((await http('/socket.io/?EIO=4&transport=polling',undefined,host.cookie)).body.code,'HANDSHAKE_CAPACITY');assert.equal(sample('handshake-full').pendingHandshakes,128);assert.equal((await snapshot(host)).roster.length,100);
 const expires=Date.now()+15000;while(app.diagnosticSnapshot().metadata.pendingHandshakes){assert(Date.now()<expires,'Pending handshake expiry exceeded expected 10-second timeout');await delay(100);}
 assert.equal(sample('handshake-expired').pendingHandshakes,0);check('128 unauthenticated Engine.IO handshakes cap and expire in real wall time; active sockets survive');
 // Rejected entries exceed the full default cache, without throttling via clock refill.
 let first,last;for(let i=0;i<300;i++){tick();const input=envelope(anchor,{code:'not-a-code',nickname:'P0'}); // valid six-digit wrong invitation
 input.payload.code='999999'===g.view.invitation.code?'999998':'999999';
 const r=await send(anchor,'game.join',input);assert.equal(r.code,'GAME_NOT_FOUND');if(i===0)first=input;last=input;}
 assert.equal(sample('rejection-cache-full').ledger.maxTransientPerScope,256);assert.equal((await send(anchor,'game.join',first)).code,'STALE_REQUEST');
 tick(120001);assert.equal((await send(anchor,'game.join',last)).code,'STALE_REQUEST');assert.deepEqual(await send(anchor,'game.join',pinned.input),pinned.result);assert.equal(sample('rejection-cache-expired').ledger.maxTransientPerScope,0);check('256 rejection cache bound/expiry preserves successful admission replay and fences evicted requests');
 // Retain 99 anchors and churn one slot through 900 new identities.
 const churn=players.at(-1);let row=(await snapshot(host)).roster.find(row=>row.nickname==='P99');tick();assert.equal((await send(host,'player.remove',envelope(host,{targetPlayerId:row.playerId}))).outcome,'REMOVED');
 for(let i=100;i<1000;i++){const c=await browser();await join(c,g.view.invitation.code,'P'+i);row=(await snapshot(c)).ownPlayer;tick();assert.equal((await send(host,'player.remove',envelope(host,{targetPlayerId:row.playerId}))).outcome,'REMOVED');if(i%100===0){sample('history-'+i);console.log('PROGRESS admission history '+(i+1)+'/1000');}}
 const candidate=await browser();tick();const history=await send(candidate,'game.join',envelope(candidate,{code:g.view.invitation.code,nickname:'Beyond'}));assert.equal(history.code,'ADMISSION_HISTORY_LIMIT');assert.equal(sample('history-full').admissionHistory,1000);assert.equal((await snapshot(host)).roster.length,99);assert.equal((await snapshot(anchor)).ownPlayer.nickname,'P0');check('1000 admission-history bound includes removals, preserves 99 active players and rejects new admission');
 const oldGame=anchor.gameId;const second=await commit(host);assert.notEqual(second.result.gameId,oldGame);assert.equal(app.diagnosticSnapshot().metadata.admissionHistory,0);assert(app.diagnosticSnapshot().metadata.sessions.waiting<=256);assert.equal((await send(host,'game.start',envelope(host,{},oldGame))).code,'WRONG_GAME');
 assert.equal((await http('/api/host/games',g.input,host.cookie)).body.code,'STALE_REQUEST');
 for(let i=0;i<3;i++)await commit(host);
 const lastGame=await snapshot(host);assert.equal(lastGame.roster.length,0);sample('replaced-four-times');check('Repeated replacements clear admission/pinned game data, bound former waiting memberships and fence obsolete commands');
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=sanitizeDiagnostic(error.stack??error.message);process.exitCode=1;console.error('FAIL '+report.error);}
finally{for(const socket of sockets){socket.disconnect();socket.io.disconnect();}await app?.close();report.ended=new Date().toISOString();await writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,error:report.error,output:directory},null,2));}
