import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifest = JSON.parse(readFileSync(new URL("../../scripts/cloudflared-manifest.json", import.meta.url), "utf8"));
export const connectorVersion = manifest.version;

export function defaultConnectorPath(platform = process.platform) {
  const filename = platform === "win32" ? "cloudflared.exe" : "cloudflared";
  return fileURLToPath(new URL("../../tooling/" + filename, import.meta.url));
}

export function verifyConnectorBinary(path) {
  const target = manifest.platforms[process.platform + "-" + process.arch];
  if (!target) throw new Error("No pinned connector for this operating system and architecture.");
  const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (actual !== target.executableSha256) {
    throw new Error("Connector checksum mismatch. Run npm run setup:tunnel to install the pinned executable.");
  }
}
