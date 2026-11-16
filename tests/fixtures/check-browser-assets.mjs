// Run after the production web build. Walk all emitted files, including maps.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../apps/web/dist/', import.meta.url));
const markers = ['Inkfin private fixture', 'Lanternfish private fixture'];

function check(directory) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      count += check(path);
    } else {
      const content = readFileSync(path);
      for (const marker of markers) assert(!content.includes(marker), 'Private fixture in ' + path);
      count++;
    }
  }
  return count;
}

const files = check(dist) + check(fileURLToPath(new URL('../../apps/server/hosting-assets/', import.meta.url))); 
assert(files > 0, 'The browser build is empty.');
console.log('Checked ' + files + ' built/served browser files for private pack and view fixtures.');
