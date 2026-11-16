import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlatformAdapter, type NativePlatform } from '../../apps/server/src/hosting/platform/index.js';
afterEach(() => vi.useRealTimers());
function fixture() { let time=100000; const native: NativePlatform={now:()=>time,setActive:vi.fn(()=>true),powerHealthy:()=>true,ownProcess:()=>true}; return {native, advance:(n:number)=>{time+=n;}}; }
describe('continuous clock and power boundary',()=>{
  it('uses synchronous native time even before resume watchdog fires',async()=>{
    const f=fixture(), resume=vi.fn(), adapter=await createPlatformAdapter({native:f.native,onResume:resume});
    expect(adapter.now()).toBe(0);f.advance(30000);expect(adapter.now()).toBe(30000);expect(resume).not.toHaveBeenCalled();await adapter.close();
  });
  it('detects one long elapsed gap and ignores ordinary wall-clock changes',async()=>{
    vi.useFakeTimers();const f=fixture(), resume=vi.fn(), adapter=await createPlatformAdapter({native:f.native,onResume:resume});
    vi.setSystemTime(new Date('2040-01-01'));f.advance(250);vi.advanceTimersByTime(250);expect(adapter.now()).toBe(250);expect(resume).not.toHaveBeenCalled();
    f.advance(30000);vi.advanceTimersByTime(250);expect(resume).toHaveBeenCalledTimes(1);vi.advanceTimersByTime(250);expect(resume).toHaveBeenCalledTimes(1);await adapter.close();
  });
  it('holds one power request and releases on close',async()=>{
    const f=fixture(), adapter=await createPlatformAdapter({native:f.native});adapter.setActive(true);adapter.setActive(true);expect(f.native.setActive).toHaveBeenCalledTimes(1);await adapter.close();await adapter.close();expect(f.native.setActive).toHaveBeenLastCalledWith(false);expect(f.native.setActive).toHaveBeenCalledTimes(2);
  });
  it('reports unavailable sleep prevention without claiming success',async()=>{
    const f=fixture(),warning=vi.fn();f.native.setActive=()=>false;const adapter=await createPlatformAdapter({native:f.native,onWarning:warning});adapter.setActive(true);expect(warning).toHaveBeenCalledWith(expect.stringContaining('Keep this computer awake'));await adapter.close();
  });
  it('detects an inhibitor that exits after starting',async()=>{
    vi.useFakeTimers();const f=fixture(),warning=vi.fn();f.native.powerHealthy=()=>false;const adapter=await createPlatformAdapter({native:f.native,onWarning:warning});adapter.setActive(true);vi.advanceTimersByTime(250);expect(warning).toHaveBeenCalledTimes(1);await adapter.close();
  });
  it('fails closed for missing native helpers and failed ownership',async()=>{
    await expect(createPlatformAdapter({helperPath:'/missing/niche-platform.node'})).rejects.toThrow('native platform helper');
    const f=fixture();f.native.ownProcess=()=>false;await expect(createPlatformAdapter({native:f.native})).rejects.toThrow('process ownership');
  });
  it('refuses a backwards native clock instead of extending deadlines',async()=>{
    const f=fixture(),adapter=await createPlatformAdapter({native:f.native});f.advance(-1);expect(()=>adapter.now()).toThrow('continuous clock failed');await adapter.close();
  });
});
