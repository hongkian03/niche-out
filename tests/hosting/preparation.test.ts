import { describe, expect, it, vi } from 'vitest';
import { preparedHosting } from '../../apps/server/src/hosting/preparation.js';
import type { ManagedHosting } from '../../apps/server/src/hosting/controller.js';

function fixture() {
  let state = 'idle';
  const manager: ManagedHosting = {
    snapshot: () => ({status:state,sessionId:state === 'idle' ? null : 'public-session'}),
    start: vi.fn(async () => { state = 'ready'; }),
    stop: vi.fn(async () => { state = 'idle'; }), application:null,
  };
  return manager;
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => {resolve = r;}); return {promise,resolve}; }

describe('private preparation lifecycle', () => {
  it('deduplicates explicit startup and starts the manager only after verification', async () => {
    const manager = fixture(), gate = deferred();
    const prepare = vi.fn(async (_signal, progress) => { progress({stage:'downloading',receivedBytes:5,totalBytes:10}); await gate.promise; });
    const host = preparedHosting(manager,prepare);
    const first = host.start(), second = host.start();
    expect(first).toBe(second);
    await Promise.resolve();
    expect(host.snapshot()).toMatchObject({status:'preparing',preparation:{stage:'downloading'}});
    expect(manager.start).not.toHaveBeenCalled();
    gate.resolve(); await first;
    expect(host.snapshot().status).toBe('ready'); expect(prepare).toHaveBeenCalledTimes(1);
    expect(manager.start).toHaveBeenCalledTimes(1);
    await host.stop(); expect(host.snapshot().status).toBe('idle');
  });
  it('fences late acquisition after cancellation and supports a fresh attempt', async () => {
    const manager = fixture(), gate = deferred();
    const host = preparedHosting(manager, async () => gate.promise);
    const first = host.start(); await Promise.resolve(); const cancelled = host.stop();
    expect(host.snapshot().status).toBe('stopping');
    gate.resolve(); await Promise.all([first,cancelled]);
    expect(manager.start).not.toHaveBeenCalled(); expect(host.snapshot().status).toBe('idle');
    await host.start(); expect(host.snapshot().status).toBe('ready'); await host.stop();
  });
  it('redacts acquisition failures and requires finish before retry', async () => {
    const manager = fixture(); let broken = true;
    const host = preparedHosting(manager, async () => { if (broken) throw new Error('https://proxy:secret@example.com'); });
    await host.start();
    expect(host.snapshot()).toMatchObject({status:'failed',reason:'connector-prepare-failed'});
    expect(JSON.stringify(host.snapshot())).not.toContain('secret');
    broken = false; await host.start(); expect(manager.start).not.toHaveBeenCalled();
    await host.stop(); await host.start(); expect(host.snapshot().status).toBe('ready'); await host.stop();
  });
  it('cancels a manager startup already in progress without reviving readiness', async () => {
    const manager = fixture(), gate = deferred();
    manager.start = vi.fn(() => gate.promise);
    const host = preparedHosting(manager, async () => {});
    const first = host.start(); await vi.waitFor(() => expect(manager.start).toHaveBeenCalledTimes(1));
    const stop = host.stop(); gate.resolve(); await Promise.all([first,stop]);
    expect(manager.stop).toHaveBeenCalledTimes(1); expect(host.snapshot().status).toBe('idle');
  });
});
