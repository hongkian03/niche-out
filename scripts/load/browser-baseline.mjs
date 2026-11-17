// Actual production-browser recovery baseline. Owns one temporary tunnel.
// Fault routing is confined to this fresh test browser; no application changes.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { HostingManager } from '../../apps/server/dist/hosting/manager.js';
import { startConnector } from '../../apps/server/dist/hosting/connector.js';
import { createGameApplication } from '../../apps/server/dist/game/application.js';
import { gameHostingStatus } from '../../apps/server/dist/game/hosting-status.js';
import { launchBrowser } from '../../probes/browser.mjs';

const output = new URL('../../work/network-baseline/browser-' + Date.now() + '/', import.meta.url);
await mkdir(output, { recursive: true });
const started = performance.now(), visible = process.argv.includes('--visible');
const report = { status:'RUNNING', started:new Date().toISOString(), scope:'Fresh desktop Chrome at phone size, actual built GameClient and production server through owned Quick Tunnel. Synthetic per-browser frame loss; not a provider outage, physical phone, 100-browser benchmark, or DNS reproduction.', checks:[], timeline:[], network:{pollingRequests:0,statuses:{},failures:[]}, screenshots:[], faults:[], answerAttempts:[] };
const safe = value => String(value).replace(/(?:https?|wss?):\/\/[^\s"')]+/g, '[redacted URL]').slice(0, 400);
const mark = (event, detail = {}) => report.timeline.push({ elapsedMs:performance.now()-started,event,...detail });
const check = label => { report.checks.push(label); mark('check',{label}); console.log('PASS ' + label); };
const manager = new HostingManager({createApplication:(id,token)=>createGameApplication(id,token,{port:0}),connectorFactory:startConnector});
manager.subscribe(state=>manager.application?.setHostingStatus(gameHostingStatus(state)));
let browser, fault = null, connection = null;
const cleanup = async () => { await browser?.close(); await manager.stop(); };
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>void cleanup().finally(()=>process.exit(130)));
async function until(fn, timeout=45000){const end=Date.now()+timeout;while(!await fn()){if(Date.now()>end)throw new Error('Browser baseline condition timed out');await delay(100);}}
async function shot(page,name){await page.screenshot({path:new URL(name+'.png',output).pathname,fullPage:true});report.screenshots.push(name+'.png');}
async function answering(page){const field=page.getByLabel('Your answer',{exact:true});await field.waitFor();await until(async()=>await field.isEnabled());return field;}
async function answer(page,text){await (await answering(page)).fill(text);await page.getByRole('button',{name:'Submit',exact:true}).click();}
function packet(message, kind){if(typeof message!=='string')return null;const found=new RegExp('^4'+kind+'([0-9]*)(\\[.*)$','s').exec(message);if(!found)return null;try{return {id:found[1],data:JSON.parse(found[2])};}catch{return null;}}
function observe(page,label){
 page.on('request',request=>{const url=new URL(request.url());if(url.pathname==='/socket.io/'&&url.searchParams.get('transport')==='polling'){report.network.pollingRequests++;mark('polling-request',{label,method:request.method()});}});
 page.on('response',response=>{const url=new URL(response.url());if(url.pathname==='/socket.io/'){const status=response.status();report.network.statuses[status]=(report.network.statuses[status]??0)+1;}});
 page.on('requestfailed',request=>{const url=new URL(request.url());if(url.pathname==='/socket.io/'){const failure={label,error:safe(request.failure()?.errorText??'unknown')};report.network.failures.push(failure);mark('request-failed',failure);}});
 page.on('pageerror',error=>mark('page-error',{label,message:safe(error.message)}));
}
try{
 report.compiledServerSha256=createHash('sha256').update(await readFile(new URL('../../apps/server/dist/game/application.js',import.meta.url))).digest('hex');
 await manager.start();assert.equal(manager.snapshot().status,'ready');mark('endpoint-ready');
 browser=await launchBrowser({headless:!visible});report.browser=browser.version();
 const hostContext=await browser.newContext({viewport:{width:1280,height:900}}),host=await hostContext.newPage();observe(host,'host');
 await host.goto(manager.application.mintOwnerLink());await host.locator('#game-file').waitFor();
 const pack={schemaVersion:1,title:'Browser network baseline',settings:{readingSeconds:0.2,answerSeconds:120,resultsSeconds:1},tiers:[{id:'rare',name:'Rare',points:100}],prompts:[1,2].map(i=>({id:'round'+i,text:'Submit the fixture answer when instructed.',answers:[{text:'Amber',aliases:['Gold'],tierId:'rare'}]}))};
 report.fixtureSha256=createHash('sha256').update(JSON.stringify(pack)).digest('hex');
 await host.locator('#game-file').setInputFiles({name:'browser-baseline.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});
 await host.getByRole('button',{name:'Create lobby',exact:true}).click();await host.getByRole('button',{name:'Start game',exact:true}).waitFor();
 const url=await host.locator('a.join-link').getAttribute('href');
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.routeWebSocket('**/socket.io/**',route=>{
   const upstream=route.connectToServer();let closing=false;connection={route,upstream};mark('websocket-open',{label:'tested-player'});
   route.onMessage(message=>{
     if(closing)return;
     if(message==='5')mark('websocket-upgraded',{label:'tested-player'});
     const event=packet(message,'2');
     if(event?.data[0]==='answer.submit'){
       const fingerprint=createHash('sha256').update(event.data[1].requestId).digest('hex').slice(0,16);
       report.answerAttempts.push({elapsedMs:performance.now()-started,fingerprint});mark('answer-attempt',{fingerprint});
       if(fault?.kind==='drop-before-delivery'){
         fault.handled=true;report.faults.push({kind:fault.kind,elapsedMs:performance.now()-started});fault=null;
         closing=true;void Promise.all([route.close(),upstream.close()]);return;
       }
       if(fault?.kind==='drop-accepted-ack')fault.ackId=event.id;
     }
     upstream.send(message);
   });
   upstream.onMessage(message=>{
     if(closing)return;
     const statePacket=packet(message,'2');
     if(fault?.kind==='drop-accepted-ack'&&fault.ackId!==undefined&&['state.changed','state.snapshot'].includes(statePacket?.data[0])){mark('state-withheld-until-close');return;}
     const acknowledgement=packet(message,'3');
     if(fault?.kind==='drop-accepted-ack'&&acknowledgement?.id===fault.ackId&&acknowledgement.data[0]?.outcome==='ACCEPTED'){
       report.faults.push({kind:fault.kind,elapsedMs:performance.now()-started,serverAccepted:true});mark('accepted-ack-dropped');fault=null;
       closing=true;void Promise.all([route.close(),upstream.close()]);return;
     }
     route.send(message);
   });
 });
 const player=await context.newPage();observe(player,'tested-player');
 await player.goto(url);await player.getByLabel('Nickname',{exact:true}).fill('Baseline A');await player.getByRole('button',{name:'Join game',exact:true}).click();await player.getByText('Waiting for the host to start',{exact:false}).waitFor();
 const otherContext=await browser.newContext({viewport:{width:390,height:844}}),other=await otherContext.newPage();observe(other,'other-player');
 await other.goto(url);await other.getByLabel('Nickname',{exact:true}).fill('Baseline B');await other.getByRole('button',{name:'Join game',exact:true}).click();await other.getByText('Waiting for the host to start',{exact:false}).waitFor();
 await until(()=>report.timeline.some(x=>x.event==='websocket-upgraded'));check('Real browser starts polling and opens WebSocket; production negotiation policy unchanged');
 await host.getByRole('button',{name:'Start game',exact:true}).click();await answering(player);await answering(other);
 fault={kind:'drop-accepted-ack'};await answer(player,'Gold');
 await until(()=>report.faults.some(x=>x.kind==='drop-accepted-ack'));
 await player.getByText('Answer accepted. Waiting for the round to finish.',{exact:true}).waitFor({timeout:45000});
 await until(async()=>!(await player.locator('.connection-notice').count()));
 check('Server acceptance survives deliberately lost acknowledgement and transport closure');await shot(player,'accepted-after-recovery');
 await (await answering(other)).fill('Gold');
 await otherContext.setOffline(true);await until(async()=>await other.getByLabel('Your answer',{exact:true}).isDisabled());
 await otherContext.setOffline(false);assert.equal(await (await answering(other)).inputValue(),'Gold');
 await delay(1000);assert.equal(await other.getByText('Answer accepted. Waiting for the round to finish.',{exact:true}).count(),0);
 check('Unsubmitted draft freezes offline, returns after reconnect, and does not auto-submit');await shot(other,'draft-after-recovery');
 await other.getByRole('button',{name:'Submit',exact:true}).click();await player.getByRole('heading',{name:'Round complete',exact:true}).waitFor();
 await answering(player);await answering(other);await until(()=>report.timeline.filter(x=>x.event==='websocket-upgraded').length>=2);
 const before=report.answerAttempts.length;fault={kind:'drop-before-delivery'};await answer(player,'Gold');
 await until(()=>report.faults.some(x=>x.kind==='drop-before-delivery'));
 await until(async()=>{const field=player.getByLabel('Your answer',{exact:true});return await field.count()&&await field.isEnabled()&&await player.getByText('No answer is locked. You can submit again while time remains.',{exact:true}).count()>0;});
 await delay(1500);
 assert.equal(report.answerAttempts.length,before+1,'Unexpected automatic answer retransmission after undelivered submission');
 check('Undelivered answer reconciles as unlocked, with no automatic fresh-ID submission');await shot(player,'unaccepted-after-recovery');
 await answer(player,'Gold');await player.getByText('Answer accepted. Waiting for the round to finish.',{exact:true}).waitFor();
 assert.notEqual(report.answerAttempts.at(-1).fingerprint,report.answerAttempts.at(-2).fingerprint,'Explicit second submission needs a new request');
 await answer(other,'Gold');await player.getByRole('heading',{name:'Final results',exact:true}).waitFor();
 await host.getByRole('heading',{name:'Joint winners',exact:true}).waitFor();assert.deepEqual(await host.locator('table .total-points').allTextContents(),['200','200']);
 check('Explicit resubmission completes two rounds with exact joint 200-point totals');await shot(player,'finished');
 assert(report.network.pollingRequests>0);assert(report.faults.length===2);assert(!report.timeline.some(row=>row.event==='page-error'),'Unexpected page script error');report.status='PASS';
}catch(error){report.status='FAIL';report.error=safe(error.message);process.exitCode=1;mark('failure',{message:report.error});console.error('FAIL '+report.error);if(browser)for(const [i,context]of browser.contexts().entries()){if(i===0)continue;for(const [j,page]of context.pages().entries())try{await shot(page,'failure-player-'+i+'-'+j);}catch{}}}
finally{
 try{await cleanup();}catch(error){report.status='FAIL';report.cleanupError=safe(error.message);process.exitCode=1;}report.ended=new Date().toISOString();report.elapsedMs=performance.now()-started;
 await writeFile(new URL('report.json',output),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,output:output.pathname,checks:report.checks,error:report.error},null,2));
}
