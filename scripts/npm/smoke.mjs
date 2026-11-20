// Fresh browser against the installed tarball's launcher, worker and owned tunnel.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {launchBrowser} from '../../probes/browser.mjs';
import {sanitizeDiagnostic} from '../load/sanitize.mjs';
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
const privateValues=new Set();
// Retain observed one-use capabilities only in memory so failure reports cannot echo them.
const rememberPrivateUrl=value=>{try{const parsed=new URL(value),fragment=parsed.hash.slice(1);if(fragment&&!fragment.includes('='))privateValues.add(fragment);for(const parameters of [parsed.searchParams,new URLSearchParams(fragment)])for(const [name,value] of parameters)if(/access|owner|token|secret|capability/i.test(name)&&value.length>=8)privateValues.add(value);}catch{}};
const diagnostic=value=>{
 let text=String(value??'');for(const secret of privateValues)if(secret.length>=8)text=text.split(secret).join('[redacted-capability]');
 text=text.replace(/("(?:access|nonce|capability)"\s*:\s*)("(?:\\.|[^"\\])*"|[^,}\]\s]+)/gi,'$1"[redacted]"');
 text=text.replace(/\b(access|nonce|capability)\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s,;]+)/gi,'$1=[redacted]');
 return sanitizeDiagnostic(text);
};
const check=message=>{report.checks.push(message);console.log('PASS '+message);};
const until=async(fn,ms=30000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error('Installed npm browser condition timed out');await delay(100);}};
try{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Installed launcher did not open setup')),30000);child.once('message',m=>{clearTimeout(timer);resolve(m.privateUrl)});child.once('exit',()=>{clearTimeout(timer);reject(Error('Installed launcher exited before setup'))});});
 browser=await launchBrowser();report.browser=browser.version();
 const hostContext=await browser.newContext({viewport:{width:1280,height:900}});
 hostContext.on('page',page=>page.on('framenavigated',frame=>{if(frame===page.mainFrame())rememberPrivateUrl(frame.url());}));
 const dashboard=await hostContext.newPage();rememberPrivateUrl(url);
 await dashboard.goto(url);await dashboard.locator('#start').click();
 await until(async()=>{const text=await dashboard.locator('#status').textContent();if(!report.preparationStates.includes(text))report.preparationStates.push(text);if(text==='Hosting unavailable')throw Error('Installed hosting setup failed');return text==='Your session is ready';},330000);
 check('Installed launcher/native helper and explicit connector preparation reach real public readiness');
 const popup=hostContext.waitForEvent('page');await dashboard.locator('#owner').click();const host=await popup;await host.locator('#game-file').waitFor();await until(()=>host.locator('#game-file').isEnabled());
 const pack={schemaVersion:1,title:'Installed npm smoke',settings:{readingSeconds:0.2,answerSeconds:30,resultsSeconds:0.3},tiers:[{id:'rare',name:'Rare',points:100}],prompts:[{id:'one',text:'Name a season.',answers:[{text:'Autumn',aliases:['Fall'],tierId:'rare'}]},{id:'two',text:'Name a colour.',answers:[{text:'Amber',tierId:'rare'}]}]};
 await host.locator('#game-file').setInputFiles({name:'smoke.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(pack))});await until(async()=>{const alerts=await host.getByRole('alert').allTextContents();if(alerts.length)throw Error('Installed upload failed: '+alerts.join(' '));return await host.getByRole('button',{name:'Create lobby',exact:true}).count()>0;});await host.getByRole('button',{name:'Create lobby',exact:true}).click();await host.getByRole('button',{name:'Start game',exact:true}).waitFor();
 const invitation=await host.locator('a.join-link').getAttribute('href');const players=[];
 for(const nickname of ['Npm A','Npm B']){const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await page.goto(invitation);await page.getByLabel('Nickname',{exact:true}).fill(nickname);await page.getByRole('button',{name:'Join game',exact:true}).click();await page.getByText('Waiting for the host to start',{exact:false}).waitFor();players.push(page);}
 await host.getByRole('button',{name:'Start game',exact:true}).click();
 for(const [index,answer] of ['Fall','Amber'].entries())for(const [playerIndex,page] of players.entries()){
  await page.getByText('Round '+(index+1)+' of 2',{exact:true}).waitFor();const field=page.getByLabel('Your answer',{exact:true});await field.waitFor();await until(()=>field.isEnabled());
  const layout=await page.evaluate(()=>({viewport:window.innerWidth,content:document.documentElement.scrollWidth}));
  assert(layout.content<=layout.viewport+1,'Phone answer layout has horizontal overflow');(report.phoneLayouts??=[]).push({round:index+1,player:playerIndex,...layout});
  if(index===0&&playerIndex===0)await page.screenshot({path:join(directory,'player-answering-390.png'),fullPage:true});
  if(index===0){await field.fill('Banana');await page.getByRole('button',{name:'Submit',exact:true}).click();await page.locator('#answer-feedback .field-error').waitFor({state:'visible'});await until(()=>field.isEditable());}
  await field.fill(answer);await page.getByRole('button',{name:'Submit',exact:true}).click();
 }
 await host.getByRole('heading',{name:'Joint winners',exact:true}).waitFor();assert.deepEqual(await host.locator('table .total-points').allTextContents(),['200','200']);check('Actual bundled worker, two phone-size players, rejection/retry, aliases and joint200 scores');
 await players[0].reload();await players[0].getByRole('heading',{name:'Final results',exact:true}).waitFor();check('Installed production browser refresh restores admitted identity and final results');
 await players[0].screenshot({path:join(directory,'player-finished-390.png'),fullPage:true});
 await host.close();assert.equal(child.exitCode,null);const recovered=hostContext.waitForEvent('page');await dashboard.locator('#owner').click();const recoveredHost=await recovered;await recoveredHost.locator('.host-shell.phase-finished').waitFor();check('Browser closure leaves hosting alive and private owner recovery preserves final state');
 const publicOrigin=new URL(invitation).origin;
 const localCookies=await hostContext.cookies(new URL(url).origin);assert(localCookies.length>0,'Expected private controller authentication before public-cookie recovery');
 const publicCookies=await hostContext.cookies(publicOrigin);assert(publicCookies.length>0,'Expected public host cookies before recovery test');
 for(const domain of new Set(publicCookies.map(cookie=>cookie.domain)))await hostContext.clearCookies({domain});
 assert.equal((await hostContext.cookies(publicOrigin)).length,0,'Public host cookies were not cleared');
 const preservedLocal=await hostContext.cookies(new URL(url).origin);assert(localCookies.every(before=>preservedLocal.some(after=>after.name===before.name&&after.domain===before.domain&&after.path===before.path&&after.value===before.value)),'Private controller authentication changed during public-cookie clearing');
 await recoveredHost.close();const cookieRecovery=hostContext.waitForEvent('page');await dashboard.locator('#owner').click();const cookieRecoveredHost=await cookieRecovery;await cookieRecoveredHost.locator('.host-shell.phase-finished').waitFor();assert.deepEqual(await cookieRecoveredHost.locator('table .total-points').allTextContents(),['200','200']);check('Clearing public-origin host cookies preserves private controller access and owner recovery restores final scores');
 await dashboard.locator('#quit').click();await dashboard.locator('#confirmAction').click();await until(()=>child.exitCode!==null);assert.equal((await exited).code,0);check('Explicit quit closes installed npm launcher and owned tunnel');report.status='PASS';
}catch(error){report.status='FAIL';report.error=diagnostic(error.message);process.exitCode=1;console.error('FAIL '+report.error);if(browser){report.alerts=[];for(const context of browser.contexts())for(const page of context.pages())try{report.alerts.push(...(await page.getByRole('alert').allTextContents()).map(diagnostic));}catch{}}}
finally{await browser?.close();if(child.exitCode===null){if(child.connected)child.send('stop');await Promise.race([exited,delay(5000)]);if(child.exitCode===null)child.kill('SIGTERM');}report.importDiagnostics=logs.flatMap(text=>text.split('\n')).filter(line=>line.startsWith('[niche:import]')).map(diagnostic);report.ended=new Date().toISOString();await writeFile(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,output:directory,error:report.error},null,2));}
