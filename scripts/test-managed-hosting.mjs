import assert from 'node:assert/strict';
import { HostingManager } from '../apps/server/dist/hosting/manager.js';
import { startConnector } from '../apps/server/dist/hosting/connector.js';
import { createApplication } from '../apps/server/dist/hosting/application.js';
import { createController } from '../apps/server/dist/hosting/controller.js';
import { launchBrowser } from '../probes/browser.mjs';
import { browserSmoke } from '../probes/tunnel/smoke.mjs';
import QRCode from 'qrcode';
import { setTimeout as delay } from 'node:timers/promises';
let connector;
const manager = new HostingManager({createApplication, healthIntervalMs:500, outageTimeoutMs:60000,
 connectorFactory:async(...args)=>connector=await startConnector(...args)});
const controller=await createController(manager);
let browser;
const lifecycleChecks=[];
async function cleanup(){await browser?.close();await manager.stop();await controller.close();}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void cleanup().finally(()=>process.exit(130));});
try {
 browser=await launchBrowser();
 const context=await browser.newContext();const page=await context.newPage();
 await page.goto(controller.accessUrl());
 await page.waitForFunction(()=>!location.hash);
 const control=async(path,body={})=>page.evaluate(async({path,body})=>{const r=await fetch('/control/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};},{path,body});
 await page.waitForFunction(async()=> (await fetch('/control/state')).ok);
 await page.locator('#start').click();
 console.log('Managed hosting: waiting for public readiness…');
 const deadline=Date.now()+210000;
 while(manager.snapshot().status!=='ready'&&Date.now()<deadline){if(manager.snapshot().status==='failed')throw new Error('Managed startup failed: '+manager.snapshot().reason);await delay(1000);}
 assert.equal(manager.snapshot().status,'ready');
 const {publicOrigin:origin,sessionId}=manager.snapshot();
 console.log('Managed public endpoint ready; running browser integration.');
 const qr=await page.evaluate(async()=>await(await fetch('/control/qr')).text());
 assert.equal(qr,await QRCode.toString(origin,{type:'svg',margin:2,errorCorrectionLevel:'M'}));
 await page.waitForFunction(()=>!document.querySelector('#sharing').hidden);
 await page.locator('#enlarge').click();assert.equal(await page.locator('#qrDialog').evaluate(el=>el.open),true);
 await page.getByRole('button',{name:'Close',exact:true}).click();
 const popup=page.waitForEvent('popup');await page.locator('#owner').click();const host=await popup;await host.waitForLoadState('domcontentloaded');
 await host.waitForFunction(()=>document.body.textContent.includes('Host authorized'));
 assert.equal(new URL(host.url()).hash,'');
 await host.reload();await host.waitForFunction(()=>document.body.textContent.includes('Host authorized'));
 const outsider=await browser.newContext();
 assert.equal((await outsider.request.post(origin+'/control/start',{headers:{Origin:origin},data:{}})).status()>=400,true);
 assert.equal((await outsider.request.get(controller.origin+'/control/state')).status(),401);
 await browserSmoke(origin, {cookieName: "__Host-niche-player"});
 if(process.platform!=='win32'&&connector.pid){
  const pid=connector.pid;process.kill(pid,'SIGSTOP');
  try{const until=Date.now()+20000;while(manager.snapshot().status==='ready'&&Date.now()<until)await delay(250);assert.equal(manager.snapshot().status,'reconnecting');}
  finally{process.kill(pid,'SIGCONT');}
  const until=Date.now()+30000;while(manager.snapshot().status!=='ready'&&Date.now()<until)await delay(250);
  assert.equal(manager.snapshot().status,'ready');assert.equal(manager.snapshot().publicOrigin,origin);
  assert.equal(manager.snapshot().sessionId,sessionId);
  await host.reload();await host.waitForFunction(()=>document.body.textContent.includes('Host authorized'));
  process.kill(pid,'SIGTERM');
  const failedBy=Date.now()+10000;while(manager.snapshot().status!=='failed'&&Date.now()<failedBy)await delay(100);
  assert.equal(manager.snapshot().status,'failed');assert.equal(manager.snapshot().publicOrigin,null);
  assert.equal((await control('start')).status,409);
  lifecycleChecks.push('owned connector interruption/recovery and loss');
 }
 assert.equal((await control('finish',{sessionId,confirm:true})).status,200);
 assert.equal(manager.snapshot().status,'idle');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Ready to host');
 await page.locator('#start').click();
 console.log('Checking a fresh managed hosting session…');
 const freshDeadline=Date.now()+210000;while(manager.snapshot().status!=='ready'&&Date.now()<freshDeadline){if(manager.snapshot().status==='failed')throw new Error('Fresh startup failed');await delay(1000);}
 assert.equal(manager.snapshot().status,'ready');assert.notEqual(manager.snapshot().sessionId,sessionId);assert.notEqual(manager.snapshot().publicOrigin,origin);
 const player=await outsider.newPage();await player.goto(manager.snapshot().publicOrigin);await player.evaluate(()=>window.probeReady);await player.waitForFunction(()=>document.querySelector('#connection').textContent.includes('ok'));
 assert.equal(await player.locator('#control').textContent(),'Control generation 1');
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Your session is ready');
 await page.locator('#finish').click();await page.locator('#confirmAction').click();
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Ready to host');assert.equal(manager.snapshot().status,'idle');
 lifecycleChecks.push('fresh endpoint and identity','dashboard start/QR/host/finish confirmation');
 console.log(JSON.stringify({status:'PASS',browser:browser.version(),checks:['local setup authentication','managed startup','exact public QR','private host exchange and refresh','public/local control isolation','public browser transport and tab fixture',...lifecycleChecks,'explicit finish cleanup']}));
} finally {await cleanup();}
