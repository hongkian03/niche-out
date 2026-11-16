import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createGameApplication } from '../../apps/server/dist/game/application.js';
import { HostingManager } from '../../apps/server/dist/hosting/manager.js';
import { startConnector } from '../../apps/server/dist/hosting/connector.js';
import { gameHostingStatus } from '../../apps/server/dist/game/hosting-status.js';
const samples = [], transportEvents=[];
let bytes = 0, peak = 0, connector, app, manager;
const loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
const start = performance.now(), cpu = process.cpuUsage();
const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 20);
sampler.unref();
const create = async (id, token) => app = await createGameApplication(id, token, { port: 0, onDiagnostic: s => { if (s.kind === 'command')
        samples.push(s);
    else if(s.kind==='transport')transportEvents.push({...s,atMs:performance.now()-start});
    else bytes += s.bytes ?? 0; } });
if (process.argv.includes('--tunnel')) {
    manager = new HostingManager({ createApplication: create, connectorFactory: async (...args) => connector = await startConnector(...args) });
    manager.subscribe(s => manager.application?.setHostingStatus(gameHostingStatus(s)));
    await manager.start();
    if (manager.snapshot().status !== 'ready')
        throw new Error('Tunnel not ready: ' + manager.snapshot().status);
}
else {
    await create('load-instance', 'load-health');
    app.configureOrigin('https://load.example.com:' + app.port);
    app.setHostingStatus({ status: 'ready', publicOrigin: 'https://load.example.com:' + app.port });
}
process.send({ kind: 'ready', port: app.port, origin: manager?.snapshot().publicOrigin ?? 'https://load.example.com:' + app.port, ownerLink: app.mintOwnerLink() });
process.on('message', async (m) => {
    if (m.kind === 'snapshot') {
        global.gc?.();
        process.send({ kind: 'snapshot', id: m.id, metrics: { elapsedMs: performance.now() - start, cpu: process.cpuUsage(cpu), memory: process.memoryUsage(), peakRssBytes: peak, eventLoop: { p50Ms: loop.percentile(50) / 1e6, p95Ms: loop.percentile(95) / 1e6, p99Ms: loop.percentile(99) / 1e6, maxMs: loop.max / 1e6 }, logicalSocketEgressBytes: bytes, diagnostics: app.diagnosticSnapshot(), transportEvents, samples } });
    }
    if (m.kind === 'clear-diagnostic-samples') {
        samples.length = 0;
        global.gc?.();
        process.send({ kind: 'done', id: m.id, memory: process.memoryUsage() });
    }
    if (m.kind === 'connector-stop') {
        process.kill(connector.pid, 'SIGSTOP');
        process.send({ kind: 'done', id: m.id });
    }
    if (m.kind === 'connector-resume') {
        process.kill(connector.pid, 'SIGCONT');
        process.send({ kind: 'done', id: m.id });
    }
    if (m.kind === 'close') {
        if (connector)
            try {
                process.kill(connector.pid, 'SIGCONT');
            }
            catch { }
        ;
        await manager?.stop();
        if (!manager)
            await app.close();
        clearInterval(sampler);
        loop.disable();
        process.disconnect();
    }
});
