import { randomUUID } from 'node:crypto';
import type { ManagedHosting } from './controller.js';

export interface PreparationProgress {
  stage: 'checking' | 'waiting' | 'downloading' | 'verifying';
  receivedBytes?: number;
  totalBytes?: number;
}

/** Local-only acquisition state; never extends the public game wire protocol. */
export function preparedHosting(manager: ManagedHosting,
  prepare: (signal: AbortSignal, progress: (value: PreparationProgress) => void) => Promise<void>): ManagedHosting {
  let pending: Promise<void> | undefined, stopping: Promise<void> | undefined;
  let abort: AbortController | undefined, acquiring = false, id: string | null = null;
  let progress: PreparationProgress | undefined, error: string | undefined;
  return {
    get application() { return manager.application; },
    snapshot() {
      if (stopping) return { status: 'stopping', sessionId: id ?? manager.snapshot().sessionId };
      if (acquiring) return { status: 'preparing', sessionId: id, preparation: progress };
      if (error) return { status: 'failed', sessionId: id, reason: error };
      return manager.snapshot();
    },
    start() {
      if (stopping) return stopping;
      if (pending) return pending;
      if (manager.snapshot().status !== 'idle' || error) return Promise.resolve();
      const current = abort = new AbortController();
      id = randomUUID(); acquiring = true; progress = { stage: 'checking' };
      pending = Promise.resolve().then(async () => {
        await prepare(current.signal, value => { if (!current.signal.aborted) progress = value; });
        current.signal.throwIfAborted(); acquiring = false;
        await manager.start();
      }).catch(cause => {
        if (!current.signal.aborted) {
          const code = (cause as { code?: unknown })?.code;
          error = typeof code === 'string' && /^[a-z-]{1,64}$/.test(code) ? code : 'connector-prepare-failed';
        }
      }).finally(() => { acquiring = false; progress = undefined; pending = undefined; });
      return pending;
    },
    stop() {
      if (stopping) return stopping;
      abort?.abort();
      const preparation = pending;
      stopping = Promise.resolve().then(async () => {
        await manager.stop();
        await preparation;
      }).finally(() => { stopping = undefined; error = undefined; id = null; progress = undefined; });
      return stopping;
    },
  };
}
