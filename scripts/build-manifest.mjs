import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ignored = new Set([".git", ".DS_Store", "node_modules", "dist", "build", "test-results", "tooling", ".local", "dist-release", "work"]);
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => !ignored.has(entry.name))
    .flatMap(entry => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : entry.isFile() ? [path] : [];
    });
}
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const files = sourceFiles(root).sort().map(path => [
  relative(root, path).replaceAll("\\", "/"), sha256(readFileSync(path))
]);
let gitCommit = null;
try {
  gitCommit = execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
  }).trim();
} catch {
  // An extracted source tree still has a reproducible content identity below.
}
const lockBytes = readFileSync(join(root, "package-lock.json"));
const lock = JSON.parse(lockBytes);
const connector = JSON.parse(readFileSync(join(root, "scripts/cloudflared-manifest.json")));
const manifest = {
  formatVersion: 1, version: lock.version, gitCommit,
  sourceSha256: sha256(JSON.stringify(files)), lockSha256: sha256(lockBytes),
  connector: { version: connector.version, manifestSha256: sha256(readFileSync(join(root, "scripts/cloudflared-manifest.json"))) },
  node: process.versions.node, npm: JSON.parse(readFileSync(join(root, "package.json"))).packageManager,
  platform: process.platform, arch: process.arch,
  dependencies: Object.fromEntries(Object.entries(lock.packages)
    .filter(([path, item]) => path.includes("node_modules/") && item.version)
    .map(([path, item]) => [path, item.version]))
};
mkdirSync(join(root, "build"), { recursive: true });
writeFileSync(join(root, "build/manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
