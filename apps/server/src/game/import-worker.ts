import { parentPort, workerData } from 'node:worker_threads';
import { compilePack, serializeCompiledPack, PackCompilationError } from '@rarity/game-core';

// This entry point only receives bytes from the authenticated, bounded import service.
function sample(stage: string) {
  parentPort!.postMessage({ kind: 'sample', stage, memory: process.memoryUsage() });
}
try {
  sample('started');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(workerData.bytes);
  sample('decoded');
  const input: unknown = JSON.parse(text);
  sample('parsed');
  const definition = compilePack(input);
  sample('compiled');
  parentPort!.postMessage({ kind: 'compiled', definition: serializeCompiledPack(definition) });
  sample('transferred');
} catch (error) {
  if (!(error instanceof PackCompilationError || error instanceof SyntaxError || error instanceof TypeError)) throw error;
  // Never forward raw SyntaxError messages: engines may include uploaded text.
  parentPort!.postMessage({ kind: 'invalid', fieldErrors: error instanceof PackCompilationError
    ? error.errors.slice(0, 100) : [{ path: [], message: 'Upload valid UTF-8 JSON.' }] });
} finally {
  parentPort!.close();
}
