// Private, bounded aggregate measurements. No request payloads or identities.
export function createCollector(mode) {
  if (!['off', 'light', 'detailed'].includes(mode)) throw new Error('Invalid instrumentation mode');
  const profiles = new Map(), samples = [], transportEvents = [];
  let stage = 'startup', bytes = 0, discardedSamples = 0;
  function record(sample) {
    if (mode === 'off') return;
    if (sample.kind === 'profile') {
      const key = [stage, sample.name, sample.cause ?? '', sample.phase ?? '', sample.role ?? ''].join('|');
      let row = profiles.get(key);
      if (!row) {
        if (profiles.size >= 2048) return;
        row = { stage, name: sample.name, cause: sample.cause, phase: sample.phase, role: sample.role, count: 0, totalMs: 0, maxMs: 0, bytes: 0, recipients: 0 };
        profiles.set(key, row);
      }
      row.count++; row.totalMs += sample.durationMs ?? 0; row.maxMs = Math.max(row.maxMs, sample.durationMs ?? 0);
      row.bytes += sample.bytes ?? 0; row.recipients += sample.recipients ?? 0;
    } else if (sample.kind === 'command') {
      if (samples.length < 40000) samples.push({ kind: 'command', name: sample.name, durationMs: sample.durationMs, outcome: sample.outcome, stage }); else discardedSamples++;
    } else if (sample.kind === 'transport') {
      if (transportEvents.length < 10000) transportEvents.push({ kind: 'transport', name: sample.name, outcome: sample.outcome, stage });
    } else bytes += sample.bytes ?? 0;
  }
  return { record, stage(name) { if (!/^[a-z0-9-]{1,64}$/.test(name)) throw new Error('Invalid measurement stage'); stage = name; },
    clearSamples() { samples.length = 0; },
    snapshot() { return { samples, transportEvents, logicalSocketEgressBytes: mode === 'detailed' ? bytes : null,
      instrumentation: { mode, profiles: [...profiles.values()], discardedSamples, timingBoundary: 'Socket.IO handler entry to immediately before acknowledgement enqueue; excludes queueing and network transit', logicalBytesAvailable: mode === 'detailed' } }; } };
}
export function parseProcessTime(value) {
  const match = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3]) * 60 + Number(match[4]);
}
