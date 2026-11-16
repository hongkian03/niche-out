import { describe, it, expect, vi } from "vitest";
import { HostingManager } from "../../apps/server/src/hosting/manager.js";
import { sessionHostingStateSchema } from "../../packages/contracts/src/deployment.js";
const origin = "https://session.example.com";
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture(overrides: Record<string, unknown> = {}) {
    const end = deferred<void>();
    const app = { port: 3210, configureOrigin: vi.fn(), close: vi.fn(async () => { }) };
    const connector = { origin: Promise.resolve(origin), exited: end.promise, stop: vi.fn(async () => { end.resolve(); }) };
    const createApplication = vi.fn(async () => app);
    const connectorFactory = vi.fn(async () => connector);
    const checkHealth = vi.fn(async () => true);
    const manager = new HostingManager({ createApplication, connectorFactory, checkHealth, healthIntervalMs: 5, retryMs: 2, startupTimeoutMs: 100, outageTimeoutMs: 20, ...overrides });
    return { manager, app, connector, end, createApplication, connectorFactory, checkHealth };
}
async function until(fn: () => boolean) { await vi.waitFor(() => expect(fn()).toBe(true), { interval: 5, timeout: 1000 }); }
describe("managed hosting lifecycle", () => {
    it("serializes repeated starts, binds readiness to an instance and stops idempotently", async () => {
        const f = fixture();
        const observed: string[] = [];
        f.manager.subscribe(s => observed.push(s.status));
        const a = f.manager.start(), b = f.manager.start();
        expect(a).toBe(b);
        await a;
        expect(f.createApplication).toHaveBeenCalledTimes(1);
        expect(f.connectorFactory).toHaveBeenCalledTimes(1);
        const call = f.checkHealth.mock.calls[0] as unknown as unknown[];
        expect(call[0]).toBe(origin);
        expect(call[1]).toBe(f.manager.snapshot().sessionId);
        expect(call[2]).toMatch(/^[\w-]{43}$/);
        expect(f.manager.snapshot().status).toBe("ready");
        expect(f.app.configureOrigin).toHaveBeenCalledWith(origin);
        await Promise.all([f.manager.stop(), f.manager.stop()]);
        expect(f.connector.stop).toHaveBeenCalledTimes(1);
        expect(f.app.close).toHaveBeenCalledTimes(1);
        expect(observed).toEqual(["starting", "connecting", "ready", "stopping", "idle"]);
    });
    it("does not publish ready merely because a URL was allocated", async () => {
        const f = fixture({ checkHealth: async () => false, startupTimeoutMs: 15 });
        await f.manager.start();
        expect(f.manager.snapshot()).toMatchObject({ status: "failed", publicOrigin: null, reason: "startup-timeout" });
        expect(f.app.close).toHaveBeenCalledTimes(1);
        await f.manager.stop();
    });
    it("cancels a pending URL and ignores its late completion before a fresh session", async () => {
        const pending = deferred<string>();
        const f = fixture();
        f.connector.origin = pending.promise;
        const starting = f.manager.start();
        await until(() => f.manager.snapshot().status === "connecting");
        await f.manager.stop();
        await starting;
        pending.resolve(origin);
        await Promise.resolve();
        expect(f.manager.snapshot().status).toBe("idle");
        expect(f.app.configureOrigin).not.toHaveBeenCalled();
    });
    it("closes an application created after cancellation", async () => {
        const pending = deferred<{
            port: number;
            configureOrigin: () => void;
            close: () => Promise<void>;
        }>();
        const f = fixture({ createApplication: () => pending.promise });
        const starting = f.manager.start();
        const stopping = f.manager.stop();
        pending.resolve(f.app);
        await Promise.all([starting, stopping]);
        expect(f.app.close).toHaveBeenCalledTimes(1);
        expect(f.connectorFactory).not.toHaveBeenCalled();
        expect(f.manager.snapshot().status).toBe("idle");
    });
    it("preserves application and origin through temporary connectivity loss", async () => {
        let healthy = true;
        const f = fixture({ checkHealth: async () => healthy, outageTimeoutMs: 1000 });
        await f.manager.start();
        const id = f.manager.snapshot().sessionId;
        healthy = false;
        await until(() => f.manager.snapshot().status === "reconnecting");
        expect(f.app.close).not.toHaveBeenCalled();
        healthy = true;
        await until(() => f.manager.snapshot().status === "ready");
        expect(f.manager.snapshot()).toMatchObject({ sessionId: id, publicOrigin: origin });
        await f.manager.stop();
    });
    it("requires explicit disposal/new start after connector death", async () => {
        const f = fixture();
        await f.manager.start();
        const id = f.manager.snapshot().sessionId;
        f.end.resolve();
        await until(() => f.manager.snapshot().status === "failed");
        expect(f.manager.snapshot()).toMatchObject({ reason: "connector-exited", publicOrigin: null });
        await f.manager.start();
        expect(f.createApplication).toHaveBeenCalledTimes(1);
        expect(f.app.close).not.toHaveBeenCalled();
        await f.manager.stop();
        expect(f.app.close).toHaveBeenCalledTimes(1);
        expect(id).not.toBeNull();
    });
    it("stops a permanently unreachable connector and hides stale invitations", async () => {
        let healthy = true;
        const f = fixture({ checkHealth: async () => healthy });
        await f.manager.start();
        healthy = false;
        await until(() => f.manager.snapshot().status === "failed");
        expect(f.manager.snapshot()).toMatchObject({ reason: "endpoint-lost", publicOrigin: null });
        expect(f.connector.stop).toHaveBeenCalledTimes(1);
        await f.manager.stop();
    });
    it("rejects an unsafe provider origin and cleans up application and connector", async () => {
        const f = fixture();
        f.connector.origin = Promise.resolve("http://localhost");
        await f.manager.start();
        expect(f.manager.snapshot().status).toBe("failed");
        expect(f.app.configureOrigin).not.toHaveBeenCalled();
        expect(f.app.close).toHaveBeenCalledTimes(1);
        await f.manager.stop();
    });
    it("keeps lifecycle state strict and rejects stale invitations on failed state", () => {
        expect(sessionHostingStateSchema.safeParse({ status: "failed", sessionId: "s", publicOrigin: origin, reason: "endpoint-lost" }).success).toBe(false);
        expect(sessionHostingStateSchema.safeParse({ status: "ready", sessionId: "s", publicOrigin: origin, secret: "x" }).success).toBe(false);
    });
});

it("verifies the actual public health response belongs to this hosting instance", async () => {
    let identity: {sessionId:string;healthToken:string} | undefined;
    let valid = false;
    const f = fixture({checkHealth: undefined, startupTimeoutMs:1000});
    f.createApplication.mockImplementation(async (id?:string, token?:string) => {
        identity = {sessionId:id!,healthToken:token!};
        return f.app;
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({kind:"niche-hosting-v1",ready:true,...identity,healthToken:valid ? identity!.healthToken : "different-instance"}), {headers:{"content-type":"application/json"}})));
    try {
        const starting = f.manager.start();
        await until(() => f.manager.snapshot().status === "connecting");
        expect(f.manager.snapshot().publicOrigin).toBeNull();
        valid = true;
        await starting;
        expect(f.manager.snapshot().status).toBe("ready");
    } finally {
        await f.manager.stop();
        vi.unstubAllGlobals();
    }
});

it("treats transport exceptions during monitoring as loss of readiness", async () => {
    let throwing = false;
    const f = fixture({checkHealth:async()=>{if(throwing)throw new Error("network");return true;},outageTimeoutMs:1000});
    await f.manager.start();
    throwing=true;
    await until(()=>f.manager.snapshot().status==="reconnecting");
    throwing=false;
    await until(()=>f.manager.snapshot().status==="ready");
    await f.manager.stop();
});

it("serializes an observer-requested stop and restart before the first application resolves", async () => {
    const firstApplication = deferred<{port:number;configureOrigin:()=>void;close:()=>Promise<void>}>();
    const firstClose = vi.fn(async()=>{});
    const secondClose = vi.fn(async()=>{});
    let creations = 0;
    const manager = new HostingManager({
        createApplication:async()=> ++creations === 1 ? firstApplication.promise : {port:3210,configureOrigin:()=>{},close:secondClose},
        connectorFactory:async()=>({origin:Promise.resolve(origin),exited:new Promise<void>(()=>{}),stop:async()=>{}}),
        checkHealth:async()=>true,
    });
    let restarting:Promise<void>|undefined;
    let intercepted=false;
    manager.subscribe(state=>{
        if(state.status==="starting"&&!intercepted){
            intercepted=true;
            restarting=manager.stop().then(()=>manager.start());
        }
    });
    const firstStart = manager.start();
    await Promise.resolve();
    firstApplication.resolve({port:3210,configureOrigin:()=>{},close:firstClose});
    await firstStart;
    await restarting;
    expect(creations).toBe(2);
    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(secondClose).not.toHaveBeenCalled();
    expect(manager.snapshot().status).toBe("ready");
    await manager.stop();
    expect(secondClose).toHaveBeenCalledTimes(1);
});

it("returns the existing stop operation to a synchronous stopping observer", async()=>{
    const f=fixture();await f.manager.start();
    let nested:Promise<void>|undefined;
    let notifications=0;
    f.manager.subscribe(state=>{if(state.status==="stopping"){notifications++;nested=f.manager.stop();}});
    const stopping=f.manager.stop();
    expect(nested).toBe(stopping);
    await stopping;
    expect(notifications).toBe(1);
    expect(f.app.close).toHaveBeenCalledTimes(1);
    expect(f.manager.snapshot().status).toBe("idle");
});
