'use strict';
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const targets = Object.freeze(['darwin-arm64', 'darwin-x64', 'win32-x64', 'linux-x64']);
const nodeRange = '>=24.22.3 <25';
function versionParts(value) { return /^\d+\.\d+\.\d+$/.test(value) ? value.split('.').map(Number) : null; }
function runtimeSupported(value) {
  const p = versionParts(value);
  return !!p && p[0] === 24 && (p[1] > 22 || p[1] === 22 && p[2] >= 3);
}
function osReleaseFields(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const found = /^(ID|VERSION_ID)=(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s#]+))$/.exec(line.trim());
    if (found) values[found[1]] = found[2] ?? found[3] ?? found[4];
  }
  return values;
}
function actualFacts() {
  let linux = {};
  if (process.platform === 'linux') {
    try { linux = osReleaseFields(fs.readFileSync('/etc/os-release', 'utf8')); } catch { /* Preflight diagnoses missing facts. */ }
    try { linux.glibc = process.report.getReport().header.glibcVersionRuntime; } catch { /* No fallback to musl. */ }
  }
  return { node: process.versions.node, platform: process.platform, arch: process.arch, release: os.release(), linux };
}
function checkRuntime(facts = actualFacts()) {
  if (!runtimeSupported(facts.node)) throw new Error('Niche Out requires Node ' + nodeRange + '; found ' + facts.node + '. Install a supported Node 24 release.');
  const target = facts.platform + '-' + facts.arch;
  if (!targets.includes(target)) throw new Error('Unsupported Niche Out platform: ' + target + '. Supported targets: ' + targets.join(', ') + '.');
  const release = String(facts.release).split('.').map(Number);
  if (facts.platform === 'darwin' && !(release.length >= 1 && Number.isInteger(release[0]) && release[0] >= 24)) throw new Error('Niche Out requires macOS 15 or newer.');
  if (facts.platform === 'win32' && !(release.length >= 3 && release[0] >= 10 && release[2] >= 22000)) throw new Error('Niche Out requires Windows 11 x64 or newer.');
  if (facts.platform === 'linux') {
    const linux = facts.linux || {}, version = String(linux.VERSION_ID || '').split('.').map(Number);
    const libc = String(linux.glibc || '').split('.').map(Number);
    if (!(libc[0] > 2 || libc[0] === 2 && libc[1] >= 39)) throw new Error('Niche Out requires glibc 2.39+ Linux; musl/Alpine is not supported.');
    if (linux.ID !== 'ubuntu' || !(version[0] > 24 || version[0] === 24 && version[1] >= 4)) throw new Error('Niche Out currently supports Ubuntu 24.04+ x64/glibc. This Linux distribution/release is not validated.');
  }
  return target;
}
function nativePaths(root, target) {
  if (!targets.includes(target)) throw new Error('Unsupported native target: ' + target);
  const directory = path.join(root, 'native', target);
  return { helperPath: path.join(directory, 'niche-platform.node'), guardPath: target === 'win32-x64' ? undefined : path.join(directory, 'niche-guard') };
}
/** Capture wrapper ancestry once, without retaining process command lines. */
function ancestorPids(options = {}) {
  const parent = options.parent ?? process.ppid, platform = options.platform ?? process.platform;
  const execute = options.execute ?? execFileSync;
  if (!Number.isSafeInteger(parent) || parent < 1) throw new Error('Cannot identify the foreground launcher parent.');
  try {
    if (platform === 'win32') {
      const script = '$p=' + parent + '; $r=@(); while($p -gt 1 -and $r.Count -lt 32){$x=Get-CimInstance Win32_Process -Filter ("ProcessId="+$p); if(!$x){break}; $r += [int]$x.ProcessId; $p=[int]$x.ParentProcessId}; ConvertTo-Json -InputObject @($r) -Compress';
      const rows = JSON.parse(execute('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-Command',script], {encoding:'utf8',timeout:10000,stdio:['ignore','pipe','pipe'],windowsHide:true}));
      if (!Array.isArray(rows) || rows.some(pid => !Number.isSafeInteger(pid) || pid <= 1) || !rows.includes(parent)) throw new Error();
      return [...new Set(rows)];
    }
    const rows = []; let current = parent;
    while (current > 1 && rows.length < 32 && !rows.includes(current)) {
      rows.push(current);
      const output = execute('/bin/ps',['-o','ppid=','-p',String(current)],{encoding:'utf8',timeout:2000,stdio:['ignore','pipe','pipe']}).trim();
      if (!/^[0-9]+$/.test(output)) throw new Error();
      current = Number(output);
    }
    return rows;
  } catch { throw new Error('Cannot verify npm/terminal process ownership. Run Niche Out in a supported foreground terminal with process inspection available.'); }
}
/** Watches captured ancestors; never sends a signal to another process. */
function watchParent(onLost, options = {}) {
  const parent = options.parent ?? process.ppid, ancestors = options.ancestors ?? [parent], currentParent = options.currentParent ?? (() => process.ppid);
  const alive = options.alive ?? (pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } });
  let lost = false;
  const check = () => { if (!lost && (parent <= 1 || currentParent() !== parent || ancestors.some(pid => !alive(pid)))) { lost = true; clearInterval(timer); onLost(); } };
  const timer = setInterval(check, options.intervalMs ?? 500); timer.unref();
  return () => clearInterval(timer);
}
module.exports = { targets, nodeRange, runtimeSupported, osReleaseFields, actualFacts, checkRuntime, nativePaths, ancestorPids, watchParent };
