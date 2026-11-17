import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCollector, parseProcessTime } from '../../scripts/load/metrics.mjs';
test('collector modes distinguish unavailable bytes and sanitize arbitrary payload properties', () => {
  for (const mode of ['off', 'light', 'detailed']) {
    const c = createCollector(mode); c.stage('accepted-submit');
    c.record({kind:'command',name:'answer.submit',outcome:'ACCEPTED',durationMs:1,secret:'must not persist'});
    const r = c.snapshot(); assert.equal(r.samples.length, mode === 'off' ? 0 : 1);
    assert.equal(r.logicalSocketEgressBytes, mode === 'detailed' ? 0 : null);
    assert(!JSON.stringify(r).includes('must not persist'));
  }
});
test('profile aggregation retains phase/cause/stage boundaries and bounded samples', () => {
  const c = createCollector('detailed'); c.stage('reconnect');
  c.record({kind:'profile',name:'publish',cause:'game.resume',phase:'Lobby',durationMs:2,recipients:100});
  c.record({kind:'profile',name:'publish',cause:'game.resume',phase:'Lobby',durationMs:3,recipients:100});
  for(let i=0;i<40001;i++)c.record({kind:'command',name:'state.get',durationMs:1});
  const r=c.snapshot(); assert.equal(r.instrumentation.profiles[0].totalMs,5); assert.equal(r.instrumentation.profiles[0].recipients,200);
  assert.equal(r.samples.length,40000); assert.equal(r.instrumentation.discardedSamples,1);
  assert.throws(()=>c.stage('secret/path')); c.clearSamples(); assert.equal(c.snapshot().samples.length,0);
});
test('ps CPU parser handles macOS and Linux time formats without percent CPU inference', () => {
  assert.equal(parseProcessTime('0:01.25'),1.25); assert.equal(parseProcessTime('01:02:03'),3723);
  assert.equal(parseProcessTime('2-01:02:03'),176523); assert.equal(parseProcessTime('invalid'),null);
});
