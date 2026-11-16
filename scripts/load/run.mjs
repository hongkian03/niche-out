// Compiled-application capacity harness. Only its own temporary tunnel is targeted.
// Public traffic stays within 100 simulated players + host; excess admission/read
// stress is local-only. This is not 100 physical browsers or a venue certification.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { cpus, totalmem, release } from 'node:os';
import { createHash } from 'node:crypto';
import { io } from 'socket.io-client';
import { setTimeout as delay } from 'node:timers/promises';
import { request as httpRequest, Agent as HttpAgent } from 'node:http';
import { request as httpsRequest } from 'node:https';
const tunnel = process.argv.includes('--tunnel'), fault = process.argv.includes('--fault'), transport = process.argv.find(x => x.startsWith('--transport='))?.split('=')[1] ?? 'mixed';
const faultCycle=Number(process.argv.find(x=>x.startsWith('--fault-cycle='))?.split('=')[1]??0);
const uplink=process.argv.find(x=>x.startsWith('--uplink='))?.split('=')[1]??'not recorded';
const coldAfter=process.argv.includes('--cold-after');
const count = Number(process.argv.find(x => x.startsWith('--players='))?.split('=')[1] ?? 100);
const games = Number(process.argv.find(x => x.startsWith('--games='))?.split('=')[1] ?? (tunnel ? 3 : 10));
const rounds = Number(process.argv.find(x => x.startsWith('--rounds='))?.split('=')[1] ?? 2);
assert(Number.isInteger(rounds));
assert(['mixed', 'polling', 'websocket'].includes(transport));
assert(!fault || tunnel, '--fault requires the owned real tunnel');
assert(rounds >= 1 && rounds <= 20);
const idleSeconds = Number(process.argv.find(x => x.startsWith('--idle-seconds='))?.split('=')[1] ?? 0);
assert(idleSeconds >= 0 && idleSeconds <= 600);
assert(Number.isInteger(count));
assert(Number.isInteger(games));
assert(count >= 1 && count <= 100);
assert(games >= 1 && games <= 30);
assert(!fault || (Number.isInteger(faultCycle) && faultCycle>=0 && faultCycle<games));
const label = (tunnel ? 'tunnel' : 'local') + '-' + transport + '-' + count + '-' + Date.now();
await mkdir('work/load', { recursive: true });
const loadStarted = performance.now();
const report = { label, started: new Date().toISOString(), config: { tunnel, fault, faultCycle, coldAfter, transport, count, games, rounds, idleSeconds, creationBatch: tunnel ? 5 : 10, joinBatch: 10, reconnectBatch: count, submitBatch: count }, machine: { uplink, cpu: cpus()[0].model, cores: cpus().length, memoryBytes: totalmem(), kernel: release(), node: process.version }, checks: [], checkpoints: [], timings: [], cycles: [], failures: [], recoveries: [], retries: [], transportErrors: [], disconnects: {}, http: { requests: 0, maxInFlight: 0, bodyBytes: 0, statusCounts: {} }, measuredServerSha256: createHash('sha256').update(await readFile('apps/server/dist/game/application.js')).digest('hex'), sourceManifestSha256: createHash('sha256').update(await readFile('build/manifest.json')).digest('hex') };
const child = fork(new URL('./server.mjs', import.meta.url), tunnel ? ['--tunnel'] : [], { execArgv: ['--expose-gc'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
const logs = [];
child.stderr.on('data', b => logs.push(b.toString()));
child.stdout.on('data', () => { });
const localAgent = new HttpAgent({ lookup: (hostname, options, callback) => callback(null, options.all ? [{ address: '127.0.0.1', family: 4 }] : '127.0.0.1', 4) });
const exited = new Promise(resolve => child.once('exit', resolve));
let messageId = 0, clients = [], base, origin, host, gameId = null, httpFlight = 0;
const ipc = (kind) => new Promise((resolve, reject) => { const id = ++messageId; const timer = setTimeout(() => reject(new Error('IPC timeout ' + kind)), 15000); const fn = m => { if (m.id === id) {
    clearTimeout(timer);
    child.off('message', fn);
    resolve(m.metrics ?? m);
} }; child.on('message', fn); child.send({ kind, id }); });
const mark = s => { report.checks.push(s); report.checkpoints.push({ check:s, elapsedMs:performance.now()-loadStarted }); console.log('PASS', s); };
async function http(path, body, cookie = '') {
    report.http.requests++;
    httpFlight++;
    report.http.maxInFlight = Math.max(report.http.maxInFlight, httpFlight);
    try {
        return await new Promise((resolve, reject) => { const url = new URL(base + path); const bytes = body === undefined ? undefined : JSON.stringify(body); const req = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, { method: body === undefined ? 'GET' : 'POST', headers: { Host: new URL(origin).host, Origin: origin, Cookie: cookie, ...(bytes === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) }) } }, r => { const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => { const buffer = Buffer.concat(chunks), text = buffer.toString(); report.http.bodyBytes += buffer.length; report.http.statusCounts[r.statusCode] = (report.http.statusCounts[r.statusCode] ?? 0) + 1; let value; try {
            value = JSON.parse(text);
        }
        catch {
            value = text;
        } resolve({ status: r.statusCode, body: value, cookie: r.headers['set-cookie']?.[0]?.split(';')[0] ?? cookie }); }); }); req.setTimeout(30000, () => req.destroy(new Error('HTTP timeout'))); req.on('error', reject); req.end(bytes); });
    }
    finally {
        httpFlight--;
    }
}
async function connect(c) { const s = c.socket = io(tunnel ? base : origin.replace('https:', 'http:'), { ...(!tunnel ? { agent: localAgent } : {}), autoConnect: false, forceNew: true, reconnection: false, transports: [c.transport], extraHeaders: { Host: new URL(origin).host, Origin: origin, Cookie: c.cookie }, auth: { protocolVersion: 1, serverInstanceId: c.discovery.serverInstanceId, tabId: c.discovery.tabId }, timeout: 20000 }); s.io.on('error', error => report.transportErrors.push({ message: error.message, description: typeof error.description === 'number' ? error.description : undefined, status: error.context?.status, cause: error.context?.statusText?.code ?? String(error.context?.statusText ?? '').slice(0,160) })); s.on('disconnect', reason => report.disconnects[reason] = (report.disconnects[reason] ?? 0) + 1); s.on('state.changed', v => c.view = v); s.on('state.snapshot', v => c.view = v); s.connect(); await new Promise((resolve, reject) => { s.once('connect', resolve); s.once('connect_error', reject); }); }
async function browser(index, ownerToken) { const r = await http(ownerToken ? '/api/owner/exchange' : '/api/session', ownerToken ? { protocolVersion: 1, token: ownerToken } : { protocolVersion: 1, page: { kind: 'fresh' } }); assert.equal(r.status, 200, JSON.stringify(r.body)); const c = { cookie: r.cookie, discovery: r.body, seq: 0, transport: transport === 'polling' ? 'polling' : transport === 'mixed' && index >= 0 && index % 5 === 0 ? 'polling' : 'websocket', gameId: null, control: 0 }; await connect(c); clients.push(c); return c; }
function envelope(c, payload = {}, extra = {}) { return { protocolVersion: 1, serverInstanceId: c.discovery.serverInstanceId, tabId: c.discovery.tabId, requestId: c.discovery.requestPrefix + '.' + (++c.seq), gameId: c.gameId, payload, ...extra }; }
// Retry the identical request, never a newly generated mutation. Resume uses the
// same browser/page identity and must preserve the controlling generation.
async function recover(c) {
    if(c.recovering) return c.recovering;
    c.recovering=(async()=>{
        const started=performance.now();
        for(let attempt=0;attempt<5;attempt++){
            await delay(Math.min(1000*2**attempt,15000));
            try {
                await connect(c);
                if(c.gameId && c!==host){
                    const input=envelope(c,{mode:'loaded'});
                    const value=await emitOnce(c,'game.resume',input);
                    assert.equal(value.outcome,'RESUMED',JSON.stringify(value));
                    assert.equal(value.control.controlGeneration,c.control);
                }
                report.recoveries.push({transport:c.transport,attempts:attempt+1,durationMs:performance.now()-started});
                return;
            } catch(error) { if(attempt===4)throw error; }
        }
    })();
    try{return await c.recovering;}finally{c.recovering=null;}
}
function emitOnce(c,name,input){
    return new Promise((resolve,reject)=>{
        if(!c.socket.connected)return reject(new Error('Transport disconnected'));
        c.socket.timeout(2000).emit(name,input,(error,value)=>error?reject(error):resolve(value));
    });
}
async function send(c,name,payload={},extra={},fixed){
    const start=performance.now();
    if(!c.socket.connected)await recover(c);
    const input=fixed??envelope(c,payload,extra);
    for(let attempt=0;attempt<3;attempt++){
        try{
            if(!c.socket.connected)await recover(c);
            const value=await emitOnce(c,name,input);
            report.timings.push({name,outcome:value.code??value.outcome,durationMs:performance.now()-start});
            return value;
        }catch(error){
            report.retries.push({name,attempt:attempt+1,message:error.message,transport:c.transport});
            if(attempt===2)throw error;
        }
    }
}
const state = async (c) => { const r = await send(c, 'state.get'); assert.equal(r.outcome, 'STATE', JSON.stringify(r)); return r.view; };
async function until(fn,ms=35000){
    const end=Date.now()+ms;
    for(;;){
        await Promise.all(players.filter(p=>!p.socket.connected).map(recover));
        if(await fn())return;
        if(Date.now()>end)throw new Error('Condition timeout');
        await delay(50);
    }
}
async function batch(items, fn, width = 10) { for (let i = 0; i < items.length; i += width)
    await Promise.all(items.slice(i, i + width).map(fn)); }
async function createGame() { const pack = { schemaVersion: 1, title: 'Bounded load fixture', settings: { readingSeconds: 0.2, answerSeconds: 30, resultsSeconds: 0.2 }, tiers: [{ id: 'rare', name: 'Rare', points: 100 }, { id: 'common', name: 'Common', points: 10 }], prompts: Array.from({ length: rounds }, (_, i) => ({ id: 'round' + (i + 1), text: 'Choose an accepted fixture answer.', answers: [{ text: 'Amber', aliases: ['Gold'], tierId: 'rare' }, { text: 'Blue', tierId: 'common' }] })) }; report.fixture = {sha256:createHash('sha256').update(JSON.stringify(pack)).digest('hex'),bytes:Buffer.byteLength(JSON.stringify(pack)),pack}; const imported = await http('/api/host/import', pack, host.cookie); assert.equal(imported.status, 200, JSON.stringify(imported.body)); const { payload, gameId: unused, ...context } = envelope(host); const input = { ...context, candidateId: imported.body.candidateId, expectedGameId: imported.body.expectedGameId, expectedSetupGeneration: imported.body.expectedSetupGeneration }; const result = await http('/api/host/games', input, host.cookie); assert.equal(result.status, 200, JSON.stringify(result.body)); gameId = host.gameId = result.body.gameId; const repeated = await http('/api/host/games', input, host.cookie); assert.equal(repeated.body.gameId, gameId); const v = await state(host); return { code: v.invitation.code, commit: input }; }
let players = [];
try {
    const ready = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Startup timeout ' + logs.join(''))), 210000); child.once('message', m => { clearTimeout(timer); resolve(m); }); child.once('exit', () => reject(new Error('Server early exit ' + logs.join('')))); });
    origin = ready.origin;
    base = tunnel ? origin : 'http://127.0.0.1:' + ready.port;
    report.endpointReadyMs=performance.now()-loadStarted;
    host = await browser(-1, ready.ownerLink.split('#')[1]);
    const shell = await http('/join');
    assert.equal(shell.status, 200);
    const assetPaths = [...shell.body.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(x => x[1]);
    for (const path of [...assetPaths])
        if (path.endsWith('.css')) {
            const css = await http(path);
            for (const m of css.body.matchAll(/url\(["']?(\/assets\/[^"')]+)/g))
                if (!assetPaths.includes(m[1]))
                    assetPaths.push(m[1]);
        }
    report.assets = assetPaths;
    await batch(Array.from({ length: count }, (_, i) => i), async (i) => { await http('/join'); for (const path of assetPaths) {
        const r = await http(path);
        assert.equal(r.status, 200);
    } players[i] = await browser(i); }, tunnel ? 5 : 10);
    mark(count + ' simulated players connected; each fetched production JS/CSS assets');
    let priorGame = null, oldAnswer;
    for (let cycle = 0; cycle < games; cycle++) {
        const g = await createGame();
        for (const p of players)
            p.gameId = null;
        await batch(players, async (p, i) => { const r = await send(p, 'game.join', { code: g.code, nickname: 'P' + players.indexOf(p) }); assert.equal(r.outcome, 'JOINED', JSON.stringify(r)); p.gameId = gameId; p.control = r.control.controlGeneration; });
        if (priorGame) {
            const replay = await send(players[0], 'answer.submit', {}, {}, oldAnswer);
            assert.equal(replay.code, 'WRONG_GAME');
        }
        if (cycle === 0 && count === 100) {
            const extra = await browser(101);
            const full = await send(extra, 'game.join', { code: g.code, nickname: 'Extra' });
            assert.equal(full.code, count === 100 ? 'GAME_FULL' : undefined, JSON.stringify(full));
            extra.socket.disconnect();
            mark('101st admission rejected while admitted identities retained');
        }
        if (cycle === 0 || cycle === games - 1) {
            for (const p of players)
                p.socket.disconnect();
            await delay(200);
            const began = performance.now();
            await batch(players, async (p) => { try{await connect(p);}catch(error){report.stormInitialFailures=(report.stormInitialFailures??0)+1;await recover(p);} const r = await send(p, 'game.resume', { mode: 'loaded' }); assert.equal(r.outcome, 'RESUMED', JSON.stringify(r)); assert.equal(r.control.controlGeneration, p.control); }, count);
            report.cycles.push({ cycle, reconnectMs: performance.now() - began });
            mark(count + '-player reconnect ' + cycle + ' preserved identity/control' + (count === 100 ? ' while full' : ''));
        }
        const start = await send(host, 'game.start');
        assert.equal(start.outcome, 'STARTED');
        for (let round = 0; round < rounds; round++) {
            await until(() => players.every(p => p.view?.phase === 'Answering' && p.view.roundIndex === round));
            if (round === 0) {
                const rejected = await Promise.all(players.map(p => send(p, 'answer.submit', { text: 'Invalid fixture answer' }, { roundId: p.view.roundId, controlGeneration: p.control })));
                assert(rejected.every(x => x.outcome === 'REJECTED'));
            }
            const commands = players.map((p, i) => envelope(p, { text: i % 2 ? 'Blue' : 'Gold' }, { roundId: p.view.roundId, controlGeneration: p.control }));
            oldAnswer = commands[0];
            let accepted;
            if (tunnel && fault && cycle === faultCycle && round === 0) {
                const halfway = Math.floor(count / 2), before = await state(host);
                const first = await Promise.all(players.slice(0, halfway).map((p, i) => send(p, 'answer.submit', {}, {}, commands[i])));
                assert(first.every(x => x.outcome === 'ACCEPTED'));
                await ipc('connector-stop');
                await delay(3000);
                await ipc('connector-resume');
                await delay(6000);
                let restored = 0;
                if (!host.socket.connected)
                    await connect(host);
                for (const p of players) {
                    if (!p.socket.connected) {
                        await connect(p);
                        const r = await send(p, 'game.resume', { mode: 'loaded' });
                        assert.equal(r.outcome, 'RESUMED');
                        assert.equal(r.control.controlGeneration, p.control);
                        restored++;
                    }
                }
                const after = await state(host);
                assert.equal(after.phase, 'Answering');
                assert.equal(after.roundId, before.roundId);
                assert(after.serverNowMs > before.serverNowMs + 8900);
                await batch(players, async (p) => { const v = await state(p); assert.equal(v.ownAnswer.locked, players.indexOf(p) < halfway); });
                report.faultRecovery = { restoredPlayers: restored, acceptedLocksPreserved: halfway, clockAdvancedMs: after.serverNowMs - before.serverNowMs };
                // These players had not submitted before the outage; their action starts after recovery.
                for(let i=halfway;i<count;i++)commands[i]=envelope(players[i],{text:i%2?'Blue':'Gold'},{roundId:players[i].view.roundId,controlGeneration:players[i].control});
                const last = await Promise.all(players.slice(halfway).map((p, i) => send(p, 'answer.submit', {}, {}, commands[i + halfway])));
                accepted = [...first, ...last];
                mark('3-second live connector suspension: locks, identities and progressing timer verified after recovery');
            }
            else
                accepted = await Promise.all(players.map((p, i) => send(p, 'answer.submit', {}, {}, commands[i])));
            assert(accepted.every(x => x.outcome === 'ACCEPTED'), JSON.stringify(accepted.filter(x => x.outcome !== 'ACCEPTED')));
            const dup = await send(players[0], 'answer.submit', {}, {}, commands[0]);
            assert.equal(dup.outcome, 'ACCEPTED');
        }
        await until(() => host.view?.phase === 'Finished');
        const final = await state(host);
        assert.equal(final.standings.length, count);
        for (const row of final.standings) {
            const common = Number(row.nickname.slice(1)) % 2;
            assert.equal(row.publishedTotal, common ? rounds * 10 : rounds * 100);
            assert.equal(row.rank, common ? Math.ceil(count / 2) + 1 : 1);
        }
        assert.equal(final.winnerIds.length, Math.ceil(count / 2));
        for(const round of final.rounds){
            const detail=(await send(host,'state.get',{recapRoundId:round.roundId})).view.requestedDetail.results;
            const amber=detail.groups.find(g=>g.canonicalText==='Amber'),blue=detail.groups.find(g=>g.canonicalText==='Blue');
            assert.equal(amber.count,Math.ceil(count/2));assert.equal(amber.points,100);
            if(count>1){assert.equal(blue.count,Math.floor(count/2));assert.equal(blue.points,10);}
        }
        const metrics = await ipc('snapshot');
        report.cycles.push({ cycle, elapsedMs:metrics.elapsedMs, heapAfterGc: metrics.memory.heapUsed, rss: metrics.memory.rss, diagnostics: metrics.diagnostics });
        priorGame = gameId;
    }
    mark(games + ' complete ' + rounds + '-round games: correct scores, duplicate replay idempotent' + (games > 1 ? ', stale old-game answers rejected' : ''));
    if (!tunnel) {
        const outcomes = [];
        for (let i = 0; i < 300; i++) {
            outcomes.push((await http('/api/session', { protocolVersion: 1, page: { kind: 'fresh' } })).body.code ?? 'CREATED');
            await delay(5);
        }
        assert(outcomes.includes('SESSION_CAPACITY'));
        assert.equal((await state(host)).standings.length, count);
        mark('local-only 300 waiting-session admission pressure bounded, current players preserved');
        report.waitingPressure = outcomes.reduce((a, x) => (a[x] = (a[x] ?? 0) + 1, a), {});
        const limited = await Promise.all(Array.from({ length: 100 }, () => send(players[0], 'clock.sample', { sampleId: 'stress' })));
        assert(limited.some(x => x.code === 'RATE_LIMITED'));
        report.ratePressure = limited.reduce((a, x) => (a[x.code ?? x.outcome] = (a[x.code ?? x.outcome] ?? 0) + 1, a), {});
        mark('local-only read burst rate-limited without evicting active player');
    }
    if (idleSeconds) {
        const end = Date.now() + idleSeconds * 1000;
        while (Date.now() < end) {
            await delay(Math.min(10000, end - Date.now()));
            assert.equal((await state(host)).standings.length, count);
            const m = await ipc('snapshot');
            assert.equal(m.diagnostics.connectedSockets, count + 1);
            report.cycles.push({ idleElapsedSeconds: idleSeconds - (end - Date.now()) / 1000, heapAfterGc: m.memory.heapUsed, rss: m.memory.rss, diagnostics: m.diagnostics });
        }
        mark(idleSeconds + ' seconds idle heartbeat retention kept every admitted connection and final score');
    }
    if(coldAfter){
        for(const p of players)p.socket.disconnect();
        await delay(11000); // Let old polling GETs/close requests drain before the same 100 users reload.
        assert.equal((await ipc('snapshot')).diagnostics.connectedSockets,1);
        const before={...report.http},began=performance.now(),responses=[];
        const mainAssets=report.assets.filter(p=>/\.(js|css)$/.test(p));
        const laterAssets=report.assets.filter(p=>!mainAssets.includes(p));
        await Promise.all(Array.from({length:count},async()=>{
            responses.push((await http('/join')).status);
            const values=await Promise.all(mainAssets.map(path=>http(path)));
            responses.push(...values.map(r=>r.status));
            for(const path of laterAssets)responses.push((await http(path)).status);
        }));
        report.coldBurst={clients:count,parallelAssetsPerClient:mainAssets.length,elapsedMs:performance.now()-began,httpResponses:responses.reduce((a,x)=>(a[x]=(a[x]??0)+1,a),{}),responseBodyBytes:report.http.bodyBytes-before.bodyBytes,requests:report.http.requests-before.requests};
        assert(responses.every(x=>x===200),JSON.stringify(report.coldBurst));
        assert.equal((await state(host)).standings.length,count);
        mark(count+' simultaneous cold reloads served HTML + JS/CSS in parallel + font; existing sockets closed first');
    }
    report.server = await ipc('snapshot');
    report.retainedAfterDroppingMeasurementSamples = (await ipc('clear-diagnostic-samples')).memory;
    report.status = 'PASS';
}
catch (error) {
    report.status = 'FAIL';
    report.failures.push({ message: error.message, stack: error.stack, description: typeof error.description === 'number' ? error.description : undefined, status: error.context?.status, cause: error.context?.statusText?.code ?? String(error.context?.statusText ?? '').slice(0,160) });
    try {
        report.server = await ipc('snapshot');
    }
    catch { }
    ;
    console.error('FAIL', error.message);
    process.exitCode = 1;
}
finally {
    for (const c of clients)
        c.socket?.disconnect();
    if (child.connected)
        child.send({ kind: 'close' });
    await Promise.race([exited, delay(10000)]);
    if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGTERM');
    report.ended = new Date().toISOString();
    const summarize = rows => { const v = rows.map(x => x.durationMs).sort((a, b) => a - b); return { count: v.length, p50Ms: v[Math.floor(v.length * .5)] ?? 0, p95Ms: v[Math.floor(v.length * .95)] ?? 0, p99Ms: v[Math.floor(v.length * .99)] ?? 0, maxMs: v.at(-1) ?? 0 }; };
    report.summary = { endToEnd: summarize(report.timings), endToEndByOutcome: {}, serverByOutcome: {} };
    for (const s of report.timings) {
        const key = s.name + ':' + s.outcome;
        (report.summary.endToEndByOutcome[key] ??= []).push(s);
    }
    for (const [k, v] of Object.entries(report.summary.endToEndByOutcome))
        report.summary.endToEndByOutcome[k] = summarize(v);
    for (const s of report.server?.samples ?? []) {
        const key = s.name + ':' + s.outcome;
        (report.summary.serverByOutcome[key] ??= []).push(s);
    }
    for (const [k, v] of Object.entries(report.summary.serverByOutcome))
        report.summary.serverByOutcome[k] = summarize(v);
    const eligible = new Set(['STATE','JOINED','RESUMED','STARTED','ACCEPTED','REJECTED','CLOCK']);
    const exceeded = Object.entries(report.summary.serverByOutcome).filter(([key,value])=>eligible.has(key.split(':')[1])&&value.p95Ms>=100);
    report.processingTarget={boundary:'handler entry to ack enqueue, excluding network and event-loop queue',targetP95Ms:100,passed:Object.keys(report.summary.serverByOutcome).length ? exceeded.length===0 : null,exceeded:exceeded.map(([key])=>key)};
    if(exceeded.length){report.status='FAIL';report.failures.push({message:'Server processing p95 target failed'});process.exitCode=1;}
    const path = 'work/load/' + label + '.json';
    await writeFile(path, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, path, summary: report.summary, checks: report.checks }, null, 2));
}
