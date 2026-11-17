import {test} from 'node:test';
import assert from 'node:assert/strict';
import {processingTarget} from './processing-target.mjs';
test('a cleared prior window failure survives a passing final window',()=>{
  const report=processingTarget({'answer.submit:ACCEPTED':{p95Ms:2}},[{afterGames:5,timings:{'game.start:STARTED':{p95Ms:101}}}]);
  assert.equal(report.passed,false);assert.deepEqual(report.exceeded,[]);assert.deepEqual(report.retainedWindowFailures,[{afterGames:5,key:'game.start:STARTED'}]);
});
test('no final samples does not erase earlier measured pass or fail',()=>{
 assert.equal(processingTarget({}).passed,null);
 assert.equal(processingTarget({},[{afterGames:5,timings:{}}]).passed,null);
 assert.equal(processingTarget({},[{afterGames:5,timings:{'answer.submit:ACCEPTED':{p95Ms:2}}}]).passed,true);
 assert.equal(processingTarget({},[{afterGames:5,timings:{'answer.submit:ACCEPTED':{p95Ms:100}}}]).passed,false);
});
test('exact threshold fails while intentionally rejected capacity responses are excluded',()=>{
 const report=processingTarget({'game.start:STARTED':{p95Ms:100},'game.join:GAME_FULL':{p95Ms:1000}});
 assert.equal(report.passed,false);assert.deepEqual(report.exceeded,['game.start:STARTED']);
 assert.equal(processingTarget({'answer.submit:ACCEPTED':{p95Ms:99.9},'game.join:GAME_FULL':{p95Ms:1000}}).passed,true);
});
