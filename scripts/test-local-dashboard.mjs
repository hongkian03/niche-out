import assert from 'node:assert/strict';
import { createController } from '../apps/server/dist/hosting/controller.js';
import { launchBrowser } from '../probes/browser.mjs';
let status='idle',sessionId=null,hasState=false,stops=0;
const manager={snapshot:()=>({status,sessionId,publicOrigin:status==='ready'?'https://fixture.example':null}),
 async start(){status='ready';sessionId='fixture-session';},async stop(){stops++;status='idle';sessionId=null;},
 get application(){return sessionId?{hasDisposableState:()=>hasState,mintOwnerLink:()=> 'https://fixture.example/owner#fixture'}:null;}};
const controller=await createController(manager);let browser;
try {
 browser=await launchBrowser();const page=await browser.newPage();await page.goto(controller.accessUrl());
 await page.waitForFunction(()=>document.querySelector('#status').textContent==='Ready to host');
 await page.locator('#start').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Your session is ready');
 // Freeze only periodic state reads at the old empty snapshot. The finish
 // response must trigger authoritative refresh and a confirmation dialog.
 await page.route('**/control/state',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({state:'ready',sessionId,publicOrigin:'https://fixture.example',hasDisposableState:false,error:null})}));
 hasState=true;
 let finishSeen;const sent=new Promise(r=>finishSeen=r);
 page.on('request',r=>{if(r.url().endsWith('/control/finish')){void page.unroute('**/control/state').then(finishSeen);}});
 await page.locator('#finish').click();await sent;
 await page.waitForFunction(()=>document.querySelector('#confirm').open);
 assert.equal(stops,0);
 await page.locator('#confirmAction').click();await page.waitForFunction(()=>document.querySelector('#status').textContent==='Ready to host');assert.equal(stops,1);
 console.log('PASS local dashboard stale-state confirmation and explicit finish.');
}finally{await browser?.close();await controller.close();}
