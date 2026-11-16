// The probe deliberately returns the full validated object to the parent to
// measure structured-clone cost. Its input and output stay inside the process.
import { parentPort, workerData } from 'node:worker_threads';
import { gamePackSchema } from '../../packages/contracts/dist/pack.js';

function sample(stage) {
  parentPort.postMessage({ type: 'sample', stage, memory: process.memoryUsage() });
}

function validate() {
  sample('worker-start');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(workerData.bytes);
  sample('decoded');
  const input = JSON.parse(text);
  sample('parsed');
  const validated = gamePackSchema.safeParse(input);
  sample('validated');
  if (!validated.success) {
    parentPort.postMessage({ type: 'failure', code: 'INVALID_PACK' });
    return;
  }

  parentPort.postMessage({ type: 'candidate', pack: validated.data });
  sample('after-clone');
  parentPort.postMessage({ type: 'done' });
}

if (workerData.stall) {
  // Wait for termination by the real parent timeout.
  parentPort.on('message', () => {});
} else {
  try {
    validate();
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error;
    parentPort.postMessage({ type: 'failure', code: 'INVALID_PACK' });
  }
}
