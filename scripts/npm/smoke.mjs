// Fresh browser against the installed tarball's launcher, worker and owned tunnel.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {launchBrowser} from '../../probes/browser.mjs';
const option=name=>process.argv.find(v=>v.startsWith('--'+name+'='))?.slice(name.length+3);
const installReport=JSON.parse(await readFile(option('install-report')??'work/npm-install/report.json'));
const root=resolve(installReport.installRoot),directory=resolve(option('out-dir')??'work/npm-migration/browser');await mkdir(directory,{recursive:true});
const report={status:'RUNNING',started:new Date().toISOString(),node:process.version,installRoot:root,scope:'Actual installed npm tarball, fresh Chrome390px player, host-installed Node and selected native helper, real owned Quick Tunnel. No physical phone or other platform certification.',checks:[],preparationStates:[]};
const child=spawn(process.execPath,['-e',`(async()=>{
 const {launchHosting}=await import(${JSON.stringify(pathToFileURL(join(root,'apps/server/dist/hosting/launch.js')).href)});
 const app=await launchHosting({npmPackageRoot:${JSON.stringify(root)},interactive:false,openBrowser:url=>process.send({privateUrl:url})});
 process.on('message',async message=>{if(message==='stop'){await app.shutdown();process.disconnect();}});process.channel.unref();
})().catch(error=>{console.error(error.message);process.exitCode=1;});`],{stdio:['ignore','pipe','pipe','ipc'],env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''}});
let browser;const logs=[];child.stdout.on('data',b=>logs.push(b.toString()));child.stderr.on('data',b=>logs.push(b.toString()));
const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
const check=message=>{report.checks.push(message);console.log('PASS '+message);};
const until=async(fn,ms=30000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error('Installed npm browser condition timed out');await delay(100);}};
try{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Installed launcher did not open setup')),30000);child.once('message',m=>{clearTimeout(timer);resolve(m.privateUrl)});child.once('exit',()=>{clearTimeout(timer);reject(Error('Installed launcher exited before setup'))});});
 browser=await launchBrowser();report.browser=browser.version();
 const hostContext=await browser.newContext({viewport:{width:1280,height:900}}),dashboard=await hostContext.newPage();
 await dashboard.goto(url);await dashboard.locator('#start').click();
 await until(async()=>{const text=await dashboard.locator('#status').textContent();if(!report.preparationStates.includes(text))report.preparationStates.push(text);if(text==='Hosting unavailable')throw Error('Installed hosting setup failed');return text==='Your session is ready';},330000);
 check('Installed launcher/native helper and explicit connector preparation reach real public readiness');
 const popup=hostContext.waitForEvent('page');await dashboard.locator('#owner').click();const host=await popup;await host.locator('#game-file').waitFor();await until(()=>host.locator('#game-file').isEnabled());
 const pack={schemaVersion:1,title:'Installed npm smoke',settings:{readingSeconds:0.2,answerSeconds:30,resultsSeconds:0.3},tiers:[{id:'rare',name:'Rare',points:100}],prompts:[{id:'one',text:'Name a season.',answers:[{text:'Autumn',aliases:['Fall'],tierId:'rare'}]},{id:'two',text:'Name a colour.',answers:[{text:'Amber',tierId:'rare'}]}]};
 await host.locator('#game-file').setInputFiles({name:'smoke.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});await until(async()=>{const alerts=await host.getByRole('alert').allTextContents();if(alerts.length)throw Error('Installed upload failed: '+alerts.join(' '));return await host.getByRole('button',{name:'Create lobby',exact:true}).count()>0;});await host.getByRole('button',{name:'Create lobby',exact:true}).click();await host.getByRole('button',{name:'Start game',exact:true}).waitFor();
 const invitation=await host.locator('a.join-link').getAttribute('href');const players=[];
 for(const nickname of ['Npm A','Npm B']){const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.goto(invitation);await page.getByLabel('Nickname',{exact:true}).fill(nickname);await page.getByRole('button',{name:'Join game',exact:true}).click();await page.getByText('Waiting for the host to start',{exact:false}).waitFor();players.push(page);}
 await host.getByRole('button',{name:'Start game',exact:true}).click();
 for(const [index,answer] of ['Fall','Amber'].entries())for(const page of players){await page.getByText('Round '+(index+1)+' of 2',{exact:true}).waitFor();const field=page.getByLabel('Your answer',{exact:true});await field.waitFor();await until(()=>field.isEnabled());if(index===0){await field.fill('Banana');await page.getByRole('button',{name:'Submit',exact:true}).click();await until(()=>field.isEnabled());}await field.fill(answer);await page.getByRole('button',{name:'Submit',exact:true}).click();}
 await host.getByRole('heading',{name:'Joint winners',exact:true}).waitFor();assert.deepEqual(await host.locator('table .total-points').allTextContents(),['200','200']);check('Actual bundled worker, two phone-size players, rejection/retry, aliases and joint200 scores');
 await players[0].reload();await players[0].getByRole('heading',{name:'Final results',exact:true}).waitFor();check('Installed production browser refresh restores admitted identity and final results');
 await players[0].screenshot({path:join(directory,'player-finished-390.png'),fullPage:true});
 await host.close();assert.equal(child.exitCode,null);const recovered=hostContext.waitForEvent('page');await dashboard.locator('#owner').click();await(await recovered).locator('.host-shell.phase-finished').waitFor();check('Browser closure leaves hosting alive and private owner recovery preserves final state');
 await dashboard.locator('#quit').click();await dashboard.locator('#confirmAction').click();await until(()=>child.exitCode!==null);assert.equal((await exited).code,0);check('Explicit quit closes installed npm launcher and owned tunnel');report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.message).replace(/https?:\/\/[^\s"')]+/g,'[redacted-url]').slice(0,600);process.exitCode=1;console.error('FAIL '+report.error);if(browser){report.alerts=[];for(const context of browser.contexts())for(const page of context.pages())try{report.alerts.push(...await page.getByRole('alert').allTextContents());}catch{}}}
finally{await browser?.close();if(child.exitCode===null){if(child.connected)child.send('stop');await Promise.race([exited,delay(5000)]);if(child.exitCode===null)child.kill('SIGTERM');}report.importDiagnostics=logs.flatMap(text=>text.split('\n')).filter(line=>line.startsWith('[niche:import]'));report.ended=new Date().toISOString();await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,output:directory,error:report.error},null,2));}
