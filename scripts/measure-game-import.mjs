// Build the workspace first. Synthetic fixtures stay inside this process.
import assert from 'node:assert/strict';
import { GameEngine } from '@rarity/game-core';
import { ImportService } from '../apps/server/dist/game/imports.js';
import { readFileSync } from 'node:fs';
import { cpus, totalmem, release } from 'node:os';

console.log(JSON.stringify({ node: process.version, cpu: cpus()[0]?.model, totalMemoryBytes: totalmem(),
  kernel: release(), samplingMs: 5, rssScope: 'whole process including worker' }));
for (const name of ['small', 'representative-20x1800']) {
  const bytes = name === 'small' ? readFileSync(new URL('../examples/game.example.json', import.meta.url)) :
    Buffer.from(JSON.stringify({ schemaVersion: 1, tiers: [{ id: 'tier', name: 'Sample', points: 25 }],
      prompts: Array.from({ length: 20 }, (_, round) => ({ id: 'r' + round, text: 'Synthetic prompt ' + round,
        answers: Array.from({ length: 1800 }, (_, answer) => ({ text: 'Synthetic example ' + answer,
          tierId: 'tier', aliases: ['Alternate ' + answer + ' ' + 'x'.repeat(128)] })) })) }));
  const engine = new GameEngine({ now: () => performance.now(), newId: kind => kind + crypto.randomUUID(), newGameCode: () => '123456' });
  const service = new ImportService(engine);
  try {
    const summary = await service.importBytes(bytes);
    assert.equal(engine.state().phase, 'Setup');
    assert.equal(summary.summary.promptCount, name === 'small' ? 1 : 20);
    assert(service.lastMetrics.workerStarted);
    assert(service.lastMetrics.transferRssBytes > 0);
    console.log(JSON.stringify({ scenario: name, outcome: 'STAGED', committedPreserved: true, ...service.lastMetrics }));
  } finally { await service.close(); }
}
