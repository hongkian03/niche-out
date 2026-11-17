import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {packScenario} from './pack-scenario.mjs';

test('authored tier scores, zero points, aliases and competition ranks define expectations', () => {
  const pack={schemaVersion:1,tiers:[{id:'a',name:'A',points:10},{id:'b',name:'B',points:0},{id:'c',name:'C',points:100}],prompts:[1,2].map(i=>({id:'r'+i,text:'Choose',answers:[{text:'Alpha',tierId:'a',aliases:['A']},{text:'Beta',tierId:'b',aliases:['B']},{text:'Gamma',tierId:'c'}]}))};
  const s=packScenario(Buffer.from(JSON.stringify(pack)),3);
  assert.deepEqual(s.totals,[10,100,110]);assert.deepEqual(s.ranks,[3,2,1]);
  assert.equal(s.selections[0][1].text,'B');
  const standings=s.totals.map((publishedTotal,i)=>({nickname:'P'+i,publishedTotal,rank:s.ranks[i]}));
  s.verifyStandings(standings);
  assert.throws(()=>s.verifyStandings(standings.map(row=>({...row,publishedTotal:999}))));
  s.verifyGroups(0,[{canonicalText:'Gamma',points:100,count:1},{canonicalText:'Beta',points:0,count:1},{canonicalText:'Alpha',points:10,count:1}]);
  assert.throws(()=>s.verifyGroups(0,[{canonicalText:'Alpha',points:10,count:3}]));
});
test('Singapore source settings and complete ten-round fixture remain unchanged', async () => {
  const bytes=await readFile(new URL('../../examples/game.singapore.json',import.meta.url));
  const s=packScenario(bytes,100);
  assert.equal(s.pack.prompts.length,10);
  assert.deepEqual(s.pack.settings,{readingSeconds:3,answerSeconds:25,resultsSeconds:10});
  assert.equal(s.selections.flat().length,1000);
  assert(s.selections.flat().some(answer=>answer.text!==answer.canonicalText));
  assert.equal(s.totals.length,100);
  assert.deepEqual(await readFile(new URL('../../examples/game.singapore.json',import.meta.url)),bytes);
});
