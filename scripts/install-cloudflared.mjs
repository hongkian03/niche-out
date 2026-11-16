// Explicit contributor setup. Packaged runtime startup never calls this script.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(await readFile(new URL("cloudflared-manifest.json", import.meta.url), "utf8"));
const platform = process.platform + "-" + process.arch;
const target = manifest.platforms[platform];
if (!target) throw new Error("No pinned connector for " + platform);
const destination = join(root, "tooling", process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function verifyExecutable(path) {
  if (hash(await readFile(path)) !== target.executableSha256) {
    throw new Error("Connector executable checksum mismatch. No unverified executable will be run.");
  }
}
if (process.argv.includes("--verify")) {
  await verifyExecutable(destination);
} else {
  await mkdir(join(root, "tooling"), { recursive: true });
  const temporary = await mkdtemp(join(root, "tooling", ".cloudflared-"));
  try {
    const response = await fetch(target.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok || !response.body) throw new Error("Connector download failed: HTTP " + response.status);
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > target.bytes) throw new Error("Connector download exceeds pinned asset size.");
      chunks.push(chunk);
    }
    const download = Buffer.concat(chunks);
    if (bytes !== target.bytes || hash(download) !== target.archiveSha256) {
      throw new Error("Connector download checksum or size mismatch.");
    }
    const executable = join(temporary, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
    if (target.archive === "tgz") {
      const archive = join(temporary, "download.tgz");
      await writeFile(archive, download);
      const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim();
      if (entries !== "cloudflared") throw new Error("Unexpected connector archive contents.");
      execFileSync("tar", ["-xzf", archive, "-C", temporary, "cloudflared"]);
    } else {
      await writeFile(executable, download);
    }
    await verifyExecutable(executable);
    await chmod(executable, 0o755);
    await rename(executable, destination);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
const version = execFileSync(destination, ["--version"], { encoding: "utf8" }).trim();
if (!version.startsWith("cloudflared version " + manifest.version + " ")) throw new Error("Unexpected connector version.");
console.log(version);
console.log("Verified connector: " + destination);
