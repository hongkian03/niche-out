import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { HostingManager } from './manager.js';
import { createGameApplication, type GameApplicationOptions } from '../game/application.js';
import { gameHostingStatus } from '../game/hosting-status.js';
import { createController, type ManagedHosting } from './controller.js';
import { applicationRoot, verifyPortableResources, verifyNpmResources } from './resources.js';
import { prepareConnector } from './connector-cache.js';
import { createConnectorFactory } from './connector.js';
import { preparedHosting } from './preparation.js';
import { createPlatformAdapter } from './platform/index.js';

type GameApplication = Awaited<ReturnType<typeof createGameApplication>>;
export interface LaunchOptions {
  /** Test/embed seam. The URL is private: callers must not log or publish it. */
  openBrowser?: (privateSetupUrl: string) => void;
  interactive?: boolean;
  /** Trusted installed-package/embed seams, never browser-controlled. */
  npmPackageRoot?: string;
  connectorCacheRoot?: string;
  signal?: AbortSignal;
  /** Private measurement sink for installed-artifact qualification. */
  diagnostics?: Pick<GameApplicationOptions, 'onDiagnostic' | 'diagnosticMode' | 'commandTraceTag' | 'onCommandTrace'>;
}

/** Explicit component acquisition without creating a host or public endpoint. */
export async function prepareHosting(options: Pick<LaunchOptions, 'npmPackageRoot' | 'connectorCacheRoot' | 'signal'>) {
  const root = options.npmPackageRoot;
  if (!root) throw new Error('Preparation requires the installed npm package.');
  createRequire(import.meta.url)(join(root, 'bin/runtime.cjs')).checkRuntime();
  await verifyNpmResources(root, { required: true });
  options.signal?.throwIfAborted();
  let lastStage = '';
  return prepareConnector({manifestPath:join(root, 'scripts/cloudflared-manifest.json'),
    signal:options.signal, cacheRoot:options.connectorCacheRoot, onProgress: value => {
      if (value.stage !== lastStage) { lastStage = value.stage; console.log('Tunnel component: ' + value.stage); }
    }});
}

/** Reuses the existing manager/controller; only dependency acquisition differs. */
export async function launchHosting(options: LaunchOptions = {}) {
  const root = options.npmPackageRoot ?? applicationRoot;
  const npm = Boolean(options.npmPackageRoot);
  let target = process.platform + '-' + process.arch;
  if (npm) {
    target = createRequire(import.meta.url)(join(root, 'bin/runtime.cjs')).checkRuntime();
    await verifyNpmResources(root, { required: true });
  } else {
    if (process.versions.node !== '24.22.3') throw new Error('Niche Out contributor hosting requires Node 24.22.3; found ' + process.version + '.');
    await verifyPortableResources(root, { required: process.env.NICHE_PORTABLE === '1' });
  }
  options.signal?.throwIfAborted();
  let activeApp: GameApplication | null = null, connectorPath: string | undefined;
  const platform = await createPlatformAdapter({ helperPath: join(root, npm ? 'native/' + target + '/niche-platform.node' : 'tooling/niche-platform.node'),
    onWarning: message => console.warn('Niche Out: ' + message),
    onResume: () => activeApp?.reconcileAfterInterruption(),
  });
  const manager = new HostingManager({ async createApplication(sessionId, healthToken) {
    activeApp = await createGameApplication(sessionId, healthToken, { ...options.diagnostics, now: platform.now, onActiveChange: platform.setActive,
      ...(npm ? {importsOptions:{workerUrl:new URL('../game/import-worker.js', import.meta.url)}} : {}) });
    return activeApp;
  }, ...(npm ? {connectorFactory: async (...args) => {
    if (!connectorPath) throw new Error('The tunnel component has not been prepared.');
    return createConnectorFactory({executable:connectorPath, manifestPath:join(root,'scripts/cloudflared-manifest.json'),
      guardPath:process.platform === 'win32' ? undefined : join(root,'native',target,'niche-guard')})(...args);
  }} : {}) });
  const basic: ManagedHosting = {
    snapshot: () => manager.snapshot(), start: () => manager.start(), stop: () => manager.stop(),
    get application() { return manager.application as GameApplication | null; },
  };
  const controllerManager = npm ? preparedHosting(basic, async (signal, onProgress) => {
    connectorPath = await prepareConnector({manifestPath:join(root,'scripts/cloudflared-manifest.json'),
      signal, onProgress, cacheRoot:options.connectorCacheRoot});
  }) : basic;
  let stopping: Promise<void> | undefined;
  let controller: Awaited<ReturnType<typeof createController>>;
  try { controller = await createController(controllerManager, { onQuit: () => shutdown() }); }
  catch (error) { await platform.close(); throw error; }
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY);
  const terminal = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
  const opener = options.openBrowser ?? ((url: string) => {
    const executable = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
    const browser = spawn(executable, [url], { stdio: 'ignore' });
    const failed = () => console.error(interactive
      ? 'Could not open setup. Configure a default browser, then press Enter to retry.'
      : 'Could not open setup. Configure a default browser, then restart the launcher.');
    browser.once('error', failed);
    browser.once('exit', code => { if (code && process.platform !== 'win32') failed(); });
  });
  function openSetup() { opener(controller.accessUrl()); }
  function onSignal() { void shutdown().catch(() => { process.exitCode = 1; }); }
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
  async function shutdown() {
    if (stopping) return stopping;
    stopping = Promise.resolve().then(async () => {
      for (const signal of signals) process.removeListener(signal, onSignal);
      options.signal?.removeEventListener('abort', onSignal);
      terminal?.close();
      try { await controllerManager.stop(); }
      finally { activeApp = null; try { await controller.close(); } finally { await platform.close(); } }
    });
    return stopping;
  }
  for (const signal of signals) process.once(signal, onSignal);
  options.signal?.addEventListener('abort', onSignal, {once:true});
  if (options.signal?.aborted) { await shutdown(); options.signal.throwIfAborted(); }
  terminal?.on('line', openSetup);
  terminal?.on('close', onSignal);
  console.log('Niche Out hosting launcher is running. Opening private local setup.');
  console.log(interactive ? 'Keep this terminal open. Press Enter to reopen setup; Ctrl-C quits hosting.'
    : 'Keep this launcher process running. Use the setup page to quit, or terminate the launcher process.');
  manager.subscribe(state => {
    console.log('Hosting: ' + state.status);
    const app = manager.application as GameApplication | null;
    app?.setHostingStatus(gameHostingStatus(state));
    if (state.status === 'failed' || state.status === 'idle') platform.setActive(false);
    if (state.status === 'idle') activeApp = null;
  });
  try { openSetup(); } catch (error) { await shutdown(); throw error; }
  return { manager, hosting: controllerManager, controller, shutdown, openSetup };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  launchHosting().catch(error => { console.error(error instanceof Error ? error.message : 'Niche Out could not start.'); process.exitCode = 1; });
}
