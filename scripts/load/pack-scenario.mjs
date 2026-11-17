import assert from 'node:assert/strict';
import {gamePackSchema, matchingKey} from '@rarity/contracts';

/** Independent fixture expectations from authored JSON, not server scores. */
export function packScenario(bytes, players) {
  const pack = gamePackSchema.parse(JSON.parse(bytes.toString('utf8')));
  const tierPoints = new Map(pack.tiers.map(tier => [tier.id, tier.points]));
  const selections = pack.prompts.map((prompt, round) => Array.from({length: players}, (_, player) => {
    const answer = prompt.answers[(player + round) % prompt.answers.length];
    return {text: player % 2 && answer.aliases?.length ? answer.aliases[0] : answer.text,
      canonicalText: answer.text.trim(), points: tierPoints.get(answer.tierId)};
  }));
  const totals = Array.from({length: players}, (_, i) => selections.reduce((sum, round) => sum + round[i].points, 0));
  const sorted = [...totals].sort((a, b) => b - a);
  const ranks = totals.map(total => sorted.indexOf(total) + 1);
  let invalid = 'Not a Singapore game answer';
  const accepted = new Set(pack.prompts.flatMap(prompt => prompt.answers.flatMap(answer => [answer.text, ...(answer.aliases ?? [])])).map(matchingKey));
  while (accepted.has(matchingKey(invalid))) invalid += ' x';
  return {pack, selections, totals, ranks, invalid,
    verifyStandings(standings) {
      assert.equal(standings.length, players);
      for (const row of standings) {
        const index = Number(row.nickname.slice(1)); assert(Number.isInteger(index) && index >= 0 && index < players);
        assert.equal(row.publishedTotal, totals[index], 'Total for ' + row.nickname);
        assert.equal(row.rank, ranks[index], 'Rank for ' + row.nickname);
      }
    },
    verifyGroups(round, groups) {
      const expected = new Map();
      for (const answer of selections[round]) {
        const row = expected.get(answer.canonicalText) ?? {canonicalText: answer.canonicalText, count: 0, points: answer.points};
        row.count++; expected.set(answer.canonicalText, row);
      }
      const simplify = row => ({canonicalText: row.canonicalText, count: row.count, points: row.points});
      const order = rows => rows.sort((a, b) => a.canonicalText.localeCompare(b.canonicalText));
      assert.deepEqual(order(groups.map(simplify)), order([...expected.values()]));
    }};
}
