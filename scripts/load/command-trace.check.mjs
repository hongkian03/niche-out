import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commandTag, ackRequestId, boundedTrace} from './command-trace.mjs';
test('run-local tags correlate without preserving raw IDs and rotate with key',()=>{
  const id='secret-prefix.123',tag=commandTag('key',id);
  assert.match(tag,/^[a-f0-9]{24}$/);assert.equal(tag,commandTag('key',id));assert.notEqual(tag,commandTag('other',id));assert.equal(commandTag(null,id),null);assert.equal(commandTag('key','x'.repeat(257)),null);
});
test('ACK extraction ignores other packets and bounds parser input',()=>{
 assert.equal(ackRequestId('312[{"requestId":"prefix.12","code":"ACCEPTED"}]'),'prefix.12');
 for(const input of ['212["answer.submit",{}]','313[invalid','312'+ 'x'.repeat(17000),null])assert.equal(ackRequestId(input),null);
});
test('bounded trace persists allowlisted metadata and exposes discard count',()=>{
 const trace=boundedTrace(1);trace.record({tag:'abc',edge:'client-ack',requestId:'SECRET',cookie:'SECRET',text:'SECRET'});trace.record({tag:'def'});
 assert.deepEqual(trace.snapshot(),{samples:[{tag:'abc',edge:'client-ack'}],discarded:1,limit:1});assert(!JSON.stringify(trace.snapshot()).includes('SECRET'));
});
