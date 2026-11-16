import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Readable } from "node:stream";
export interface ConnectorHandle {
    readonly pid?: number;
    origin: Promise<string>;
    exited: Promise<void>;
    stop(): Promise<void>;
}
export type ConnectorFactory = (port: number, signal: AbortSignal) => Promise<ConnectorHandle>;
export const connectorFailureCodes = ["connector-missing", "connector-integrity", "unsupported-platform"] as const;
export class ConnectorFailure extends Error {
    constructor(readonly code: typeof connectorFailureCodes[number]) {
        super(code);
        this.name = "ConnectorFailure";
    }
}

/** Never execute a binary until its bytes match the pinned target. */
export async function verifyConnectorExecutable(executable: string, target: {executableSha256: string} | undefined): Promise<void> {
    if (!target) throw new ConnectorFailure("unsupported-platform");
    let bytes: Buffer;
    try {
        bytes = await readFile(executable);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new ConnectorFailure("connector-missing");
        throw error;
    }
    if (createHash("sha256").update(bytes).digest("hex") !== target.executableSha256) {
        throw new ConnectorFailure("connector-integrity");
    }
}
const root = fileURLToPath(new URL("../../../../", import.meta.url));
export const startConnector: ConnectorFactory = async (port, signal) => {
    const manifest = JSON.parse(await readFile(join(root, "scripts/cloudflared-manifest.json"), "utf8"));
    const target = manifest.platforms[process.platform + "-" + process.arch];
    const executable = process.env.CLOUDFLARED_PATH ?? join(root, "tooling", process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
    await verifyConnectorExecutable(executable, target);
    signal.throwIfAborted();
    const directory = await mkdtemp(join(tmpdir(), "niche-hosting-"));
    try {
        const config = join(directory, "config.yml");
        await writeFile(config, "{}\n", { mode: 0o600 });
        signal.throwIfAborted();
        const connectorArgs = ["tunnel", "--config", config, "--no-autoupdate", "--metrics", "127.0.0.1:0", "--protocol", "http2", "--url", "http://127.0.0.1:" + port];
        const guarded = process.platform !== "win32";
        const child = spawn(guarded ? join(root, "tooling", "niche-guard") : executable, guarded ? [executable, ...connectorArgs] : connectorArgs, { stdio: guarded ? ["pipe", "pipe", "pipe", "pipe"] : ["pipe", "pipe", "pipe"], env: Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("TUNNEL_") && !k.startsWith("CLOUDFLARED_"))) });
        child.stdin!.on("error", () => { /* An already exited guard can close ownership during stop. */ });
        let ended = false;
        const exited = new Promise<void>(resolve => {
            const finish = () => {
                ended = true;
                resolve();
            };
            child.once("error", finish);
            child.once("exit", finish);
        });
        const origin = new Promise<string>((resolve, reject) => {
            let tail = "";
            const inspect = (chunk: Buffer) => {
                tail = (tail + chunk.toString()).slice(-8192);
                const match = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
                if (match) {
                    resolve(match[0]);
                }
            };
            child.stdout!.on("data", inspect);
            child.stderr!.on("data", inspect);
            void exited.then(() => reject(new Error("Connector exited")));
        });
        void origin.catch(() => {
        });
        let stopping: Promise<void> | undefined;
        const stop = () => stopping ??= (async () => {
            if (!ended) {
                if (guarded) child.stdin!.end();
                else child.kill("SIGTERM");
                let timer: ReturnType<typeof setTimeout> | undefined;
                await Promise.race([exited, new Promise<void>(r => {
                        timer = setTimeout(r, 4000);
                    })]);
                clearTimeout(timer);
                if (!ended) {
                    child.kill("SIGKILL");
                    await exited;
                }
            }
            await rm(directory, { recursive: true, force: true });
        })();
        if (signal.aborted) {
            await stop();
            signal.throwIfAborted();
        }
        let connectorPid = child.pid;
        if (guarded) {
            try {
                connectorPid = await new Promise<number>((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error("Process guard startup failed")), 2000);
                    let data = "";
                    const stream = child.stdio[3] as Readable;
                    const fail = () => { clearTimeout(timeout); reject(new Error("Process guard startup failed")); };
                    stream.on("data", chunk => {
                        data = (data + chunk.toString()).slice(0, 32);
                        if (/^[1-9][0-9]*\n$/.test(data)) { clearTimeout(timeout); resolve(Number(data.trim())); }
                    });
                    stream.once("error", fail);
                    void exited.then(fail);
                });
            } catch (error) { await stop(); throw error; }
        }
        return { pid: connectorPid, origin, exited, stop };
    }
    catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
    }
};
