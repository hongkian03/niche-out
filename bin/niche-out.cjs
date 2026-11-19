#!/usr/bin/env node
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {checkRuntime, ancestorPids, watchParent} = require('./runtime.cjs');
async function main() {
  const root = fs.realpathSync(path.resolve(__dirname, '..'));
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('Niche Out\n\nUsage: niche-out [prepare]\n       niche-out --help\n       niche-out --version\n\nRun without arguments to open local hosting setup.\nprepare verifies/downloads the pinned connector without starting hosting.\nRequires supported Node 24; players use their browsers.'); return;
  }
  if (args.length === 1 && ['--version', '-v'].includes(args[0])) { console.log(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version); return; }
  if (args.length && !(args.length === 1 && args[0] === 'prepare')) throw new Error('Unknown command. Run niche-out --help.');
  checkRuntime();
  const abort = new AbortController();
  let hosting, lost = false;
  const ancestors = ancestorPids();
  const stop = watchParent(() => { lost = true; abort.abort(); if (hosting) void hosting.shutdown().catch(() => { process.exitCode = 1; }); }, {ancestors});
  try {
    const api = await import(pathToFileURL(path.join(root, 'apps/server/dist/hosting/launch.js')).href);
    if (lost) return;
    if (args[0] === 'prepare') {
      const signals = ['SIGINT','SIGTERM','SIGHUP']; const cancel = () => abort.abort();
      for (const name of signals) process.once(name, cancel);
      try { await api.prepareHosting({npmPackageRoot: root, signal: abort.signal}); }
      finally { for (const name of signals) process.removeListener(name, cancel); }
      stop();
    } else {
      hosting = await api.launchHosting({npmPackageRoot: root, signal: abort.signal});
      if (lost) await hosting.shutdown();
      else {
        const shutdown = hosting.shutdown;
        hosting.shutdown = async () => { stop(); return shutdown(); };
        // Existing launcher's signal/quit handler closes its own resources. This
        // timer is unreferenced and does not keep a closed launcher alive.
      }
    }
  } catch (error) { stop(); throw error; }
}
main().catch(error => { console.error('Niche Out: ' + (error instanceof Error ? error.message : 'Could not start.')); process.exitCode = 1; });
