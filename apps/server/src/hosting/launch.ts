import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HostingManager } from './manager.js';
import { createGameApplication } from '../game/application.js';
import { gameHostingStatus } from '../game/hosting-status.js';
import { createController, type ManagedHosting } from './controller.js';
import { applicationRoot, verifyPortableResources } from './resources.js';
import { createPlatformAdapter } from './platform/index.js';

type GameApplication = Awaited<ReturnType<typeof createGameApplication>>;
export interface LaunchOptions {
  /** Test/embed seam. The URL is private: callers must not log or publish it. */
  openBrowser?: (privateSetupUrl: string) => void;
  interactive?: boolean;
}

/** Reuses the same local controller, owner handoff and tunnel manager as developer hosting. */
export async function launchHosting(options: LaunchOptions = {}) {
  if (process.versions.node !== '24.22.3') {
    throw new Error('Niche Out requires Node 24.22.3; found ' + process.version + '. Use the bundled launcher or the project .nvmrc version.');
  }
  await verifyPortableResources(applicationRoot, { required: process.env.NICHE_PORTABLE === '1' });
  let activeApp: GameApplication | null = null;
  const platform = await createPlatformAdapter({ helperPath: join(applicationRoot, 'tooling/niche-platform.node'),
    onWarning: message => console.warn('Niche Out: ' + message),
    onResume: () => activeApp?.reconcileAfterInterruption(),
  });
  const manager = new HostingManager({ async createApplication(sessionId, healthToken) {
    activeApp = await createGameApplication(sessionId, healthToken, { now: platform.now, onActiveChange: platform.setActive });
    return activeApp;
  } });
  const controllerManager: ManagedHosting = {
    snapshot: () => manager.snapshot(), start: () => manager.start(), stop: () => manager.stop(),
    get application() { return manager.application as GameApplication | null; },
  };
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
      terminal?.close();
      try { await manager.stop(); }
      finally { activeApp = null; try { await controller.close(); } finally { await platform.close(); } }
    });
    return stopping;
  }
  for (const signal of signals) process.once(signal, onSignal);
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
  return { manager, controller, shutdown, openSetup };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  launchHosting().catch(error => { console.error(error instanceof Error ? error.message : 'Niche Out could not start.'); process.exitCode = 1; });
}
