import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir, cpus, arch, release, totalmem } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function largeFixture() {
  // The synthetic count is a measurement workload, never a validation rule.
  return {
    schemaVersion: 1, tiers: [{ id: 'sample', name: 'Sample', points: 25 }],
    prompts: Array.from({ length: 20 }, (_, round) => ({
      id: 'r' + round, text: 'Synthetic probe prompt ' + round,
      answers: Array.from({ length: 1800 }, (_, n) => ({
        text: 'Synthetic example ' + n, tierId: 'sample',
        aliases: ['Probe wording ' + n + ' ' + 'x'.repeat(128)]
      }))
    }))
  };
}

const directory = mkdtempSync(join(tmpdir(), 'rarity-import-probe-'));
try {
  const small = fileURLToPath(new URL('../../examples/game.example.json', import.meta.url));
  const large = join(directory, 'large.json');
  const malformed = join(directory, 'malformed.json');
  const unknownField = join(directory, 'unknown-field.json');
  const oversized = join(directory, 'oversized.json');
  writeFileSync(large, JSON.stringify(largeFixture()));
  writeFileSync(malformed, '{');
  writeFileSync(unknownField, JSON.stringify({ schemaVersion: 1, extra: true }));
  writeFileSync(oversized, '');
  truncateSync(oversized, 10 * 1024 ** 2 + 1);

  console.log(JSON.stringify({ node: process.version, cpu: cpus()[0]?.model, arch: arch(),
    kernel: release(), ramBytes: totalmem(), sampledParentIntervalMs: 5 }));
  for (const [file, scenario, expected] of [
    [small, 'small', 'STAGED'], [large, 'large', 'STAGED'], [malformed, 'malformed', 'INVALID_PACK'],
    [unknownField, 'invalid-shape', 'INVALID_PACK'], [oversized, 'oversized', 'UPLOAD_TOO_LARGE'],
    [small, 'unknown-capacity', 'IMPORT_CAPACITY'], [small, 'short-capacity', 'IMPORT_CAPACITY'],
    [small, 'short-heap', 'IMPORT_CAPACITY'], [small, 'timeout', 'IMPORT_TIMEOUT']
  ]) {
    const child = spawnSync(process.execPath, [
      fileURLToPath(new URL('case.mjs', import.meta.url)), file, scenario
    ], { encoding: 'utf8', timeout: 30_000 });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, child.stderr);
    const row = JSON.parse(child.stdout);
    console.log(JSON.stringify(row));
    assert.equal(row.code, expected, scenario + ' outcome');
    assert.equal(row.committedPreserved, true);
    if (scenario === 'small' || scenario === 'large') assert(row.transferPeak.rss > 0);
    if (scenario === 'oversized' || scenario.includes('capacity') || scenario === 'short-heap') {
      assert.equal(row.workerStarted, false);
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
