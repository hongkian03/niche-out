import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, release } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";

if (process.platform !== "darwin") {
  console.log("NOT RUN: the Epic 1 lifecycle experiment targets macOS. See E1-S10 for Windows/Linux steps.");
  process.exit(0);
}
const mode = process.argv[2];
const path = fileURLToPath(import.meta.url);
if (mode === "--fixture") {
  // A short-lived model of the foreground launcher. OS ownership via -w is
  // also checked if the launcher disappears without a graceful release.
  const helper = spawn("/usr/bin/caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" });
  const quit = () => { helper.kill(); process.exit(0); };
  process.stdin.on("end", quit).on("data", data => { if (String(data).trim() === "q") quit(); });
  process.once("SIGHUP", quit);
  process.once("SIGTERM", quit);
  console.log(helper.pid);
} else {
  const dir = mkdtempSync(join(tmpdir(), "game-clock-"));
  const clock = join(dir, "clock");
  try {
    execFileSync("/usr/bin/xcrun", ["clang", "-Wall", "-Wextra", "-Werror",
      fileURLToPath(new URL("clock.c", import.meta.url)), "-o", clock]);
    if (mode === "--watch") {
      console.log("Columns: continuous ms, awake ms. Press Enter before and after manually sleeping the Mac. Ctrl-D exits.");
      const child = spawn(clock, [], { stdio: "inherit" });
      const [status] = await once(child, "exit");
      assert.equal(status, 0);
    } else {
      const child = spawn(clock);
      const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
      const exited = once(child, "exit");
      const a = (await lines.next()).value.split(" ").map(Number);
      await wait(300);
      child.stdin.end("\n");
      const b = (await lines.next()).value.split(" ").map(Number);
      await exited;
      assert(b[0] > a[0] && b[1] > a[1]);
      console.log("Awake sample Δ ms (continuous, awake):", b.map((v, i) => +(v - a[i]).toFixed(1)));
      for (const action of ["q", "eof", "SIGHUP", "SIGKILL"]) {
        const launcher = spawn(process.execPath, [path, "--fixture"], { stdio: ["pipe","pipe","inherit"] });
        const done = once(launcher, "exit");
        const id = Number((await once(launcher.stdout, "data"))[0].toString().trim());
        assert(Number.isSafeInteger(id) && id > 0);
        const assertion = () => execFileSync("/usr/bin/pmset", ["-g", "assertions"], { encoding: "utf8" })
          .split("\n").some(line => line.includes("pid " + id + "(caffeinate)") && line.includes("PreventUserIdleSystemSleep"));
        const alive = () => { try { process.kill(id, 0); return true; } catch (err) { if (err.code === "ESRCH") return false; throw err; } };
        try {
          for (let i = 0; i < 25 && !assertion(); i++) await wait(50);
          assert(assertion(), "idle power assertion absent");
          if (action === "q") launcher.stdin.write("q\n");
          else if (action === "eof") launcher.stdin.end();
          else launcher.kill(action);
          await done;
          for (let i = 0; i < 50 && alive(); i++) await wait(50);
          assert(!alive() && !assertion(), "probe power helper survived launcher");
          console.log(action + ": held and released idle assertion; helper exited");
        } finally {
          if (launcher.exitCode === null && launcher.signalCode === null) launcher.kill();
          if (alive()) process.kill(id, "SIGTERM");
        }
      }
      console.log("Host:", process.platform, release(), process.arch, process.version);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
