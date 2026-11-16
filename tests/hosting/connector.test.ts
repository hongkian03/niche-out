import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startConnector, verifyConnectorExecutable, ConnectorFailure, connectorFailureCodes } from "../../apps/server/src/hosting/connector.js";
import { HostingManager } from "../../apps/server/src/hosting/manager.js";

afterEach(() => vi.unstubAllEnvs());

describe("connector failure boundaries", () => {
    it("rejects unsupported target before accessing any executable", async () => {
        await expect(verifyConnectorExecutable("/not-used", undefined)).rejects.toMatchObject({code:"unsupported-platform"});
    });
    it("classifies missing override without exposing its path", async () => {
        const directory = await mkdtemp(join(tmpdir(), "niche-missing-test-"));
        try {
            vi.stubEnv("CLOUDFLARED_PATH", join(directory,"private-name"));
            await expect(startConnector(3210,new AbortController().signal)).rejects.toMatchObject({code:"connector-missing",message:"connector-missing"});
        } finally { await rm(directory,{recursive:true,force:true}); }
    });
    it("rejects corrupted override before it can be executed", async () => {
        const directory = await mkdtemp(join(tmpdir(), "niche-integrity-test-"));
        const binary=join(directory,"fake-connector");const marker=join(directory,"executed");
        try {
            await writeFile(binary, '#!/bin/sh\ntouch "'+marker+'"\n',{mode:0o755});
            vi.stubEnv("CLOUDFLARED_PATH",binary);
            await expect(startConnector(3210,new AbortController().signal)).rejects.toMatchObject({code:"connector-integrity"});
            await expect(access(marker)).rejects.toMatchObject({code:"ENOENT"});
        } finally { await rm(directory,{recursive:true,force:true}); }
    });
    it.each(connectorFailureCodes)("publishes only sanitized %s and cleans the started listener", async code => {
        const close=vi.fn(async()=>{});
        const manager=new HostingManager({createApplication:async()=>({port:3210,configureOrigin:()=>{},close}),connectorFactory:async()=>{throw new ConnectorFailure(code);}});
        await manager.start();
        expect(manager.snapshot()).toMatchObject({status:"failed",reason:code,publicOrigin:null});
        expect(close).toHaveBeenCalledTimes(1);await manager.stop();
    });
    it("does not expose arbitrary adapter error strings as status reasons", async()=>{
        const manager=new HostingManager({createApplication:async()=>{throw new Error("secret-path-and-token");}});
        await manager.start();expect(manager.snapshot()).toMatchObject({status:"failed",reason:"startup-failed"});
        expect(JSON.stringify(manager.snapshot())).not.toContain("secret-path");await manager.stop();
    });
});
