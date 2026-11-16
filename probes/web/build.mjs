import { build } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const fixtureOutput = resolve(fileURLToPath(new URL('../../work/web-fixtures/', import.meta.url)));
export async function buildFixtures() {
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url)),
    '--project', fileURLToPath(new URL('./tsconfig.json', import.meta.url))]);
  await build({ configFile: false, root: fileURLToPath(new URL('./', import.meta.url)),
    publicDir: fileURLToPath(new URL('../../apps/web/public/', import.meta.url)),
    logLevel: 'warn', build: { outDir: fixtureOutput, emptyOutDir: true, sourcemap: false } });
}
