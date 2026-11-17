import { monitorEventLoopDelay } from 'node:perf_hooks';
import { execFile } from 'node:child_process';
import { createGameApplication } from '../../apps/server/dist/game/application.js';
import { HostingManager } from '../../apps/server/dist/hosting/manager.js';
import { startConnector } from '../../apps/server/dist/hosting/connector.js';
import { gameHostingStatus } from '../../apps/server/dist/game/hosting-status.js';
import { createCollector, parseProcessTime } from './metrics.mjs';
const mode = process.argv.find(a => /^(--instrumentation|--diagnostics)=/.test(a))?.split('=')[1] ?? 'detailed';
const collector = createCollector(mode), stages = [];
let peak = 0, connector, app, manager, stage = 'startup', stageStart = performance.now(), stageCpu = process.cpuUsage(), sampling = false;
const loop = monitorEventLoopDelay({ resolution: 10 }); loop.enable();
const start = performance.now(), cpu = process.cpuUsage();
const connectorMetrics = { scope: 'cloudflared process only; excludes native guard; ps sampled every second', available: false, samples: 0, peakRssBytes: 0, cpuSeconds: null, lastSampleElapsedMs: null };
const sampler = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 20); sampler.unref();
const processSampler = setInterval(() => {
  if (!connector?.pid || sampling) return;
  sampling = true;
  execFile('ps', ['-p', String(connector.pid), '-o', 'time=', '-o', 'rss='], { timeout: 1000 }, (error, output) => {
    sampling = false;
    if (error) return;
    const fields = output.trim().split(/\s+/), seconds = parseProcessTime(fields[0] ?? '');
    if (seconds === null || !Number.isFinite(Number(fields[1]))) return;
    connectorMetrics.available = true; connectorMetrics.samples++; connectorMetrics.cpuSeconds = seconds; connectorMetrics.lastSampleElapsedMs = performance.now() - start;
    connectorMetrics.peakRssBytes = Math.max(connectorMetrics.peakRssBytes, Number(fields[1]) * 1024);
  });
}, 1000); processSampler.unref();
const loopSnapshot = () => ({ sampleCount: Number(loop.count), p50Ms: loop.count ? loop.percentile(50) / 1e6 : null, p95Ms: loop.count ? loop.percentile(95) / 1e6 : null, p99Ms: loop.count ? loop.percentile(99) / 1e6 : null, maxMs: loop.count ? loop.max / 1e6 : null });
function finishStage() {
  const at = performance.now();
  const row = { name: stage, startedMs: stageStart - start, elapsedMs: at - stageStart, cpu: process.cpuUsage(stageCpu), memory: process.memoryUsage(), eventLoop: loopSnapshot(), diagnostics: app?.diagnosticSnapshot() };
  if (stages.length < 1000) stages.push(row);
  stageStart = at; stageCpu = process.cpuUsage(); loop.reset(); return row;
}
const create = async (id, token) => app = await createGameApplication(id, token, { port: 0,
  ...(mode === 'off' ? {} : { diagnosticMode: mode, onDiagnostic: collector.record }) });
if (process.argv.includes('--tunnel')) {
  manager = new HostingManager({ createApplication: create, connectorFactory: async (...args) => connector = await startConnector(...args) });
  manager.subscribe(s => manager.application?.setHostingStatus(gameHostingStatus(s)));
  await manager.start();
  if (manager.snapshot().status !== 'ready') throw new Error('Tunnel not ready: ' + manager.snapshot().status);
} else {
  await create('load-instance', 'load-health'); app.configureOrigin('https://load.example.com:' + app.port);
  app.setHostingStatus({ status: 'ready', publicOrigin: 'https://load.example.com:' + app.port });
}
process.send({ kind: 'ready', port: app.port, origin: manager?.snapshot().publicOrigin ?? 'https://load.example.com:' + app.port, ownerLink: app.mintOwnerLink() });
process.on('message', async m => {
  if (m.kind === 'stage') {
    // Validate before changing stage. Stage names are coordinator-selected, never payload-derived.
    collector.stage(m.name); finishStage(); stage = m.name;
    process.send({ kind: 'done', id: m.id });
  }
  if (m.kind === 'snapshot') {
    const current = finishStage();
    process.send({ kind: 'snapshot', id: m.id, metrics: { elapsedMs: performance.now() - start, cpu: process.cpuUsage(cpu), memory: process.memoryUsage(), peakRssBytes: peak,
      eventLoop: current.eventLoop, eventLoopScope: 'Most recent stage interval; all completed interval histograms retained in stages. Snapshot never forces GC.',
      diagnostics: app.diagnosticSnapshot(), ...collector.snapshot(), stages: [...stages], processResources: { application: { scope: 'Application child; excludes generator and connector', cpu: process.cpuUsage(cpu), peakRssBytes: peak }, connector: { ...connectorMetrics, lastSampleAgeMs: connectorMetrics.lastSampleElapsedMs === null ? null : performance.now() - start - connectorMetrics.lastSampleElapsedMs } } } });
  }
  if (m.kind === 'clear-diagnostic-samples') {
    finishStage(); collector.clearSamples();
    const before = process.memoryUsage(), gcStart = performance.now(); loop.disable(); global.gc?.();
    const durationMs = performance.now() - gcStart; loop.reset(); loop.enable();
    stages.push({ name: 'explicit-gc', elapsedMs: durationMs, before, memory: process.memoryUsage(), excludedFromEventLoop: true });
    stageStart = performance.now(); stageCpu = process.cpuUsage();
    process.send({ kind: 'done', id: m.id, memory: process.memoryUsage(), gcDurationMs: durationMs });
  }
  if (m.kind === 'connector-stop' || m.kind === 'connector-resume') {
    process.kill(connector.pid, m.kind === 'connector-stop' ? 'SIGSTOP' : 'SIGCONT'); process.send({ kind: 'done', id: m.id });
  }
  if (m.kind === 'close') {
    if (connector) try { process.kill(connector.pid, 'SIGCONT'); } catch {}
    await manager?.stop(); if (!manager) await app.close();
    clearInterval(sampler); clearInterval(processSampler); loop.disable(); process.disconnect();
  }
});
