import { performance } from "node:perf_hooks";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import { createProbeServer } from "./server.mjs";
import { publicOriginSchema } from "@rarity/contracts";
import { connectorVersion, defaultConnectorPath, verifyConnectorBinary } from "./connector-binary.mjs";

if (process.argv.includes("--self-test")) {
  const { selfTest } = await import("./self-test.mjs");
  await selfTest();
} else {
  const configured = process.argv.find(arg => arg.startsWith("--origin="))?.slice(9);
  const rawPort = process.argv.find(arg => arg.startsWith("--port="))?.slice(7);
  const port = rawPort === undefined ? configured ? 3210 : 0 : Number(rawPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || configured && port === 0) {
    throw new Error("Use --port=1..65535 for a named origin.");
  }
  const connectorPath = process.env.CLOUDFLARED_PATH ?? defaultConnectorPath();
  const app = createProbeServer();
  const shutdown = new AbortController();
  let connector;
  let configurationDirectory;
  let connectorExit;
  const connectorSignals = new Set();
  let lastReadiness = "not attempted";
  let stop;
  const stopped = new Promise(resolve => { stop = resolve; });
  const onSignal = () => { shutdown.abort(); stop(); };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    app.server.listen(port, "127.0.0.1");
    await once(app.server, "listening");
    const boundPort = app.server.address().port;
    let origin;
    if (configured) {
      origin = publicOriginSchema.parse(configured);
      console.log("Configure your named connector to forward to http://127.0.0.1:" + boundPort);
    } else {
      verifyConnectorBinary(connectorPath);
      const version = execFileSync(connectorPath, ["--version"], { encoding: "utf8", timeout: 5000 }).trim();
      if (!version.startsWith("cloudflared version " + connectorVersion + " ")) throw new Error("Unexpected connector executable.");
      console.log(version);
      configurationDirectory = mkdtempSync(join(tmpdir(), "niche-tunnel-config-"));
      const configurationFile = join(configurationDirectory, "config.yml");
      writeFileSync(configurationFile, "{}\n", { mode: 0o600 });
      const connectorEnvironment = Object.fromEntries(Object.entries(process.env)
        .filter(([key]) => !key.startsWith("TUNNEL_") && !key.startsWith("CLOUDFLARED_")));
      console.log("Starting temporary Cloudflare development tunnel…");
      connector = spawn(connectorPath, ["tunnel", "--config", configurationFile, "--no-autoupdate", "--metrics", "127.0.0.1:0", "--protocol", "http2",
        "--url", "http://127.0.0.1:" + boundPort], { stdio: ["ignore", "pipe", "pipe"], env: connectorEnvironment });
      connectorExit = new Promise(resolve => {
        connector.once("error", error => resolve({ error: error.code }));
        connector.once("exit", (code, signal) => resolve({ code, signal }));
      });
      origin = await new Promise((resolve, reject) => {
        let tail = "";
        const timer = setTimeout(() => reject(new Error("Connector did not supply a URL within 60 seconds.")), 60_000);
        function inspect(chunk) {
          const message = chunk.toString();
          tail = (tail + message).slice(-8192);
          for (const [pattern, label] of [
            [/Registered tunnel connection/i, "connection registered"],
            [/failed to dial|unable to establish|connection refused/i, "connector connection failed"],
            [/lookup|DNS|no such host/i, "connector DNS message"],
            [/retrying|retry in/i, "connector retrying"],
            [/ERR /, "connector error logged"]
          ]) if (pattern.test(message)) connectorSignals.add(label);
          const match = tail.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
          if (match) { clearTimeout(timer); resolve(match[0]); }
        }
        connector.stdout.on("data", inspect);
        connector.stderr.on("data", inspect);
        connectorExit.then(() => { clearTimeout(timer); reject(new Error("Connector exited before publishing a URL.")); });
        stopped.then(() => { clearTimeout(timer); reject(new Error("Probe stopped.")); });
      });
    }
    app.configure({ mode: "tunnel", purpose: "probe", provider: "cloudflare",
      tunnelKind: configured ? "named" : "quick", publicOrigin: origin,
      listen: { host: "127.0.0.1", port: boundPort }, upstreamHost: "public" });
    console.log("Allocated endpoint; checking readiness: " + origin);
    const readiness = async () => {
      const deadline = performance.now() + 180_000;
      let nextNotice = performance.now() + 15_000;
      while (performance.now() < deadline && !shutdown.signal.aborted) {
        try {
          const response = await fetch(origin + "/health", { signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(5000)]), redirect: "error" });
          lastReadiness = "HTTP " + response.status;
          if (response.ok) {
            if (response.headers.get("content-type")?.includes("application/json")) {
              if ((await response.json()).probe === "niche-tunnel-v1") return;
              lastReadiness += " unexpected JSON";
            } else lastReadiness += " non-JSON response";
          }
        } catch (error) {
          lastReadiness = "request error " + (error.cause?.code ?? error.name);
        }
        if (performance.now() >= nextNotice) {
          console.log("Waiting for public endpoint readiness (" + lastReadiness + ")…");
          nextNotice = performance.now() + 15_000;
        }
        await wait(2000, undefined, { signal: shutdown.signal });
      }
      throw new Error("Public HTTPS readiness failed. Check venue outbound access and connector configuration.");
    };
    await Promise.race([
      readiness(),
      stopped.then(() => { throw new Error("Probe stopped."); }),
      connectorExit ? connectorExit.then(() => { throw new Error("Connector exited before readiness."); }) : new Promise(() => {})
    ]);
    console.log("Open on your phone, including over cellular: " + origin);
    console.log("Expect a connection acknowledgement and a control generation. The probe uses synthetic data.");
    if (process.argv.includes("--test")) {
      const { browserSmoke } = await import("./smoke.mjs");
      await browserSmoke(origin);
    } else {
      console.log("Ctrl-C stops the probe. It expires after 10 minutes.");
      const timer = setTimeout(stop, 600_000);
      await Promise.race([stopped, connectorExit ?? new Promise(() => {})]);
      clearTimeout(timer);
    }
    console.log(JSON.stringify(app.report(), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ readiness: lastReadiness, connectorSignals: [...connectorSignals],
      application: app.report() }, null, 2));
    throw error;
  } finally {
    shutdown.abort();
    if (connector && connector.exitCode === null && connector.signalCode === null) {
      connector.kill("SIGTERM");
      const ended = await Promise.race([connectorExit.then(() => true), wait(3000).then(() => false)]);
      if (!ended) { connector.kill("SIGKILL"); await connectorExit; }
    }
    await app.close();
    if (configurationDirectory) rmSync(configurationDirectory, { recursive: true, force: true });
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}
