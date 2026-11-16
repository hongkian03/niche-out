import assert from 'node:assert/strict';
import { open } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { Worker } from 'node:worker_threads';

const MiB = 1024 ** 2;
const [file, scenario] = process.argv.slice(2);
const report = { scenario, parentPeak: {}, workerPeak: {}, transferPeak: {}, workerStages: [], workerStarted: false };
const memoryKeys = ['rss', 'heapUsed', 'external', 'arrayBuffers'];
function highWater(peak, sample) {
  for (const key of memoryKeys) peak[key] = Math.max(peak[key] ?? 0, sample[key]);
}

function sample() {
  const memory = process.memoryUsage();
  highWater(report.parentPeak, memory);
  return memory;
}

async function importCandidate() {
  const handle = await open(file, 'r');
  let bytes;
  try {
    const { size } = await handle.stat();
    report.bytes = size;
    if (size > 10 * MiB) return { code: 'UPLOAD_TOO_LARGE' };
    const capacity = {
      available: process.availableMemory(), heap: getHeapStatistics().total_available_size
    };
    if (scenario === 'unknown-capacity') capacity.available = undefined;
    if (scenario === 'short-capacity') capacity.available = 1;
    if (scenario === 'short-heap') capacity.heap = 1;
    report.preflight = capacity;
    if (!Number.isFinite(capacity.available) || capacity.available < 256 * MiB + 8 * size ||
        !Number.isFinite(capacity.heap) || capacity.heap < 128 * MiB + 8 * size) {
      return { code: 'IMPORT_CAPACITY' };
    }
    bytes = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      const { bytesRead } = await handle.read(bytes, offset, size - offset, offset);
      if (!bytesRead) throw new Error('Probe fixture unexpectedly shortened.');
      offset += bytesRead;
    }
  } finally {
    await handle.close();
  }

  const worker = new Worker(new URL('worker.mjs', import.meta.url), {
    workerData: { bytes, stall: scenario === 'timeout' },
    transferList: [bytes.buffer], resourceLimits: { maxOldGenerationSizeMb: 256 }
  });
  report.workerStarted = true;
  const sampler = setInterval(sample, 5);
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      let candidate;
      timer = setTimeout(() => resolve({ code: 'IMPORT_TIMEOUT' }), 10_000);
      worker.on('message', msg => {
        const parent = sample();
        switch (msg.type) {
          case 'sample':
            highWater(report.workerPeak, msg.memory);
            report.workerStages.push({
              stage: msg.stage, heapUsed: msg.memory.heapUsed, processRSS: msg.memory.rss
            });
            if (msg.stage === 'validated' || msg.stage === 'after-clone') {
              highWater(report.transferPeak, { ...parent, rss: Math.max(parent.rss, msg.memory.rss) });
            }
            break;
          case 'candidate':
            candidate = msg.pack;
            highWater(report.transferPeak, parent);
            break;
          case 'failure':
            resolve({ code: msg.code });
            break;
          case 'done':
            if (!candidate) return reject(new Error('Missing validated candidate.'));
            resolve({ code: 'STAGED', candidate });
            break;
          default:
            reject(new Error('Unexpected probe message.'));
        }
      });
      worker.once('error', error => {
        if (error.code === 'ERR_WORKER_OUT_OF_MEMORY') resolve({ code: 'IMPORT_CAPACITY' });
        else reject(error);
      });
      worker.once('exit', code => reject(new Error('Worker exited before outcome: ' + code)));
    });
  } finally {
    clearTimeout(timer);
    clearInterval(sampler);
    await worker.terminate();
  }
}

const prior = Object.freeze({ gameId: 'previous-game', playerCount: 3 });
const fixture = { committed: prior, candidate: undefined };
report.baseline = sample();
const start = performance.now();
const result = await importCandidate();
report.elapsedMs = Math.round(performance.now() - start);
report.code = result.code;
if (result.code === 'STAGED') {
  fixture.candidate = result.candidate;
  report.answers = fixture.candidate.prompts.reduce((n, p) => n + p.answers.length, 0);
}
assert.equal(fixture.committed, prior);
assert.deepEqual(fixture.committed, { gameId: 'previous-game', playerCount: 3 });
report.committedPreserved = true;
report.processMaxRssKiB = process.resourceUsage().maxRSS;
console.log(JSON.stringify(report));
