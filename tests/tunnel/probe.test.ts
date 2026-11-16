import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("bounds the loopback probe and rejects untrusted requests before synthetic mutation", () => {
  const workspace = fileURLToPath(new URL("../../", import.meta.url));
  const output = execFileSync(process.execPath, ["probes/tunnel/run.mjs", "--self-test"], {
    cwd: workspace, encoding: "utf8", timeout: 15_000
  });
  expect(output).toContain("PASS local probe policy");
});
