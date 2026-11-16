import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export interface NativePlatform {
  now(): number;
  setActive(active: boolean): boolean;
  powerHealthy(): boolean;
  ownProcess(): boolean;
}
export interface PlatformOptions {
  helperPath?: string;
  onWarning?: (message: string) => void;
  onResume?: () => void;
  /** Tests only; production must use the bundled native continuous clock. */
  native?: NativePlatform;
}
export interface PlatformAdapter {
  now(): number;
  setActive(active: boolean): void;
  close(): Promise<void>;
}
const require = createRequire(import.meta.url);
export async function createPlatformAdapter(options: PlatformOptions = {}): Promise<PlatformAdapter> {
  let native: NativePlatform;
  try {
    native = options.native ?? require(options.helperPath ?? fileURLToPath(new URL('../../../../../tooling/niche-platform.node', import.meta.url))) as NativePlatform;
    if (!['now', 'setActive', 'powerHealthy', 'ownProcess'].every(key => typeof native[key as keyof NativePlatform] === 'function')) throw new Error();
  } catch {
    throw new Error('The native platform helper is missing or incompatible. Developers: run npm run build:platform with the pinned Node runtime. Portable hosts: extract a fresh package for this operating system and CPU.');
  }
  if (!native.ownProcess()) throw new Error('Cannot establish launcher process ownership. Hosting has not started.');
  let active = false, closed = false;
  const origin = native.now();
  if (!Number.isFinite(origin) || origin < 0) throw new Error('The system continuous clock is unavailable.');
  let last = origin;
  const now = () => {
    const value = native.now();
    if (!Number.isFinite(value) || value < last) throw new Error('The system continuous clock failed.');
    last = value;
    return value - origin;
  };
  const warn = () => options.onWarning?.('Idle-sleep prevention is unavailable. Keep this computer awake while hosting.');
  let previous = now();
  const watchdog = setInterval(() => {
    if (closed) return;
    const time = now();
    if (time - previous > 5000) options.onResume?.();
    previous = time;
    if (active && !native.powerHealthy()) { active = false; warn(); }
  }, 250);
  watchdog.unref();
  return {
    now,
    setActive(value) {
      if (closed || value === active) return;
      if (!native.setActive(value)) { active = false; warn(); return; }
      active = value;
    },
    async close() {
      if (closed) return;
      closed = true; clearInterval(watchdog);
      if (!native.setActive(false)) warn();
      active = false;
    },
  };
}
