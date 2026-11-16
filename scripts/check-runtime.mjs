import { readFileSync } from 'node:fs';
const required = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).engines.node;
if (process.versions.node !== required) {
  console.error('Niche requires Node ' + required + '; this terminal is using ' + process.version + '. Switch to the version in .nvmrc (with nvm: nvm install && nvm use), then run npm run host again.');
  process.exitCode = 1;
}
