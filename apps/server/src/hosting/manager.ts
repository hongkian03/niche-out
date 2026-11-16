import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { publicOriginSchema, sessionHostingStateSchema } from "@rarity/contracts";
import type { SessionHostingState } from "@rarity/contracts";
import { startConnector, ConnectorFailure, connectorFailureCodes } from "./connector.js";
import type { ConnectorFactory, ConnectorHandle } from "./connector.js";
export interface ApplicationHandle {
    port: number;
    healthPath?: string;
    configureOrigin(origin: string): void | Promise<void>;
    close(): Promise<void>;
}
export interface ManagerOptions {
    createApplication(sessionId: string, healthToken: string): Promise<ApplicationHandle>;
    connectorFactory?: ConnectorFactory;
    checkHealth?: (origin: string, sessionId: string, healthToken: string, signal: AbortSignal, healthPath?: string) => Promise<boolean>;
    startupTimeoutMs?: number;
    healthIntervalMs?: number;
    outageTimeoutMs?: number;
    retryMs?: number;
}
const defaultHealth: NonNullable<ManagerOptions["checkHealth"]> = async (origin, sessionId, healthToken, signal, healthPath = "/health") => {
    try {
        const r = await fetch(origin + healthPath, { redirect: "error", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) });
        if (!r.ok || !r.headers.get("content-type")?.includes("application/json")) {
            return false;
        }
        const b = await r.json();
        return b.sessionId === sessionId && b.healthToken === healthToken && b.ready === true && b.kind === "niche-hosting-v1";
    }
    catch {
        return false;
    }
};
/** Owns transport lifetime; no game rules or timer pauses. */
export class HostingManager {
    private state: SessionHostingState = { status: "idle", sessionId: null, publicOrigin: null };
    private listeners = new Set<(state: SessionHostingState) => void>();
    private abort?: AbortController;
    private app: ApplicationHandle | null = null;
    private connector?: ConnectorHandle;
    private starting?: Promise<void>;
    private stopping?: Promise<void>;
    private monitoring?: Promise<void>;
    constructor(private options: ManagerOptions) {
    }
    get application() {
        return this.app;
    }
    snapshot(): SessionHostingState {
        return { ...this.state };
    }
    subscribe(listener: (state: SessionHostingState) => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    private publish(value: SessionHostingState) {
        this.state = sessionHostingStateSchema.parse(value);
        for (const fn of this.listeners) {
            try {
                fn(this.snapshot());
            }
            catch {
                // Status observers cannot interrupt ownership or cleanup.
            }
        }
    }
    start(): Promise<void> {
        if (this.stopping) {
            return this.stopping.then(() => this.start());
        }
        if (this.starting) {
            return this.starting;
        }
        if (this.state.status !== "idle") {
            return Promise.resolve();
        }
        const id = randomBytes(24).toString("base64url");
        const token = randomBytes(32).toString("base64url");
        const abort = this.abort = new AbortController();
        // Install the ownership guard before notifying synchronous observers.
        // An observer may request stop/restart from the starting notification.
        this.starting = Promise.resolve().then(() => this.launch(id, token, abort)).finally(() => {
            this.starting = undefined;
        });
        const operation = this.starting;
        this.publish({ status: "starting", sessionId: id, publicOrigin: null });
        return operation;
    }
    private async launch(id: string, token: string, abort: AbortController) {
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            abort.abort();
        }, this.options.startupTimeoutMs ?? 180000);
        const signal = abort.signal;
        try {
            this.app = await this.options.createApplication(id, token);
            signal.throwIfAborted();
            this.connector = await (this.options.connectorFactory ?? startConnector)(this.app.port, signal);
            signal.throwIfAborted();
            this.publish({ status: "connecting", sessionId: id, publicOrigin: null });
            const origin = publicOriginSchema.parse(await Promise.race([this.connector.origin, new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("Cancelled")), { once: true }))]));
            signal.throwIfAborted();
            await this.app.configureOrigin(origin);
            void this.connector.exited.then(() => {
                if (!signal.aborted && this.state.sessionId === id) {
                    this.publish({ status: "failed", sessionId: id, publicOrigin: null, reason: "connector-exited" });
                    abort.abort();
                }
            });
            while (!await this.healthy(origin, id, token, signal)) {
                signal.throwIfAborted();
                await delay(this.options.retryMs ?? 2000, undefined, { signal });
            }
            signal.throwIfAborted();
            clearTimeout(timer);
            this.publish({ status: "ready", sessionId: id, publicOrigin: origin });
            this.monitoring = this.monitor(origin, id, token, abort);
        }
        catch (error) {
            await this.dispose();
            if (this.state.status !== "stopping" && this.state.sessionId === id && this.state.status !== "failed") {
                this.publish({ status: "failed", sessionId: id, publicOrigin: null, reason: timedOut ? "startup-timeout" : error instanceof ConnectorFailure && connectorFailureCodes.includes(error.code) ? error.code : "startup-failed" });
            }
        }
        finally {
            clearTimeout(timer);
        }
    }
    private async healthy(origin: string, id: string, token: string, signal: AbortSignal): Promise<boolean> {
        try {
            return await (this.options.checkHealth ?? defaultHealth)(origin, id, token, signal, this.app?.healthPath);
        } catch {
            // A transport exception is an unhealthy check, never a ready state.
            return false;
        }
    }
    private async monitor(origin: string, id: string, token: string, abort: AbortController) {
        let outageSince: number | undefined;
        try {
            while (!abort.signal.aborted) {
                await delay(this.options.healthIntervalMs ?? 5000, undefined, { signal: abort.signal });
                const healthy = await this.healthy(origin, id, token, abort.signal);
                if (abort.signal.aborted || this.state.sessionId !== id) {
                    return;
                }
                if (healthy) {
                    outageSince = undefined;
                    if (this.state.status !== "ready") {
                        this.publish({ status: "ready", sessionId: id, publicOrigin: origin });
                    }
                }
                else {
                    outageSince ??= performance.now();
                    if (performance.now() - outageSince >= (this.options.outageTimeoutMs ?? 120000)) {
                        this.publish({ status: "failed", sessionId: id, publicOrigin: null, reason: "endpoint-lost" });
                        abort.abort();
                        await this.connector?.stop();
                        return;
                    }
                    if (this.state.status !== "reconnecting") {
                        this.publish({ status: "reconnecting", sessionId: id, publicOrigin: origin });
                    }
                }
            }
        }
        catch {
            // Abort interrupts the monitoring delay when stop or terminal failure owns cleanup.
        }
    }
    stop(): Promise<void> {
        if (this.stopping) {
            return this.stopping;
        }
        if (this.state.status === "idle") {
            return Promise.resolve();
        }
        const sessionId = this.state.sessionId!;
        const startup = this.starting;
        // Reserve stop before publishing, so stop-on-stopping is idempotent.
        this.stopping = Promise.resolve().then(async () => {
            await startup;
            await this.monitoring;
            await this.dispose();
            this.publish({ status: "idle", sessionId: null, publicOrigin: null });
        }).finally(() => {
            this.stopping = undefined;
        });
        const operation = this.stopping;
        this.abort?.abort();
        this.publish({ status: "stopping", sessionId, publicOrigin: null });
        return operation;
    }
    private async dispose() {
        const c = this.connector;
        this.connector = undefined;
        const a = this.app;
        this.app = null;
        try {
            await c?.stop();
        }
        finally {
            await a?.close();
        }
    }
}
