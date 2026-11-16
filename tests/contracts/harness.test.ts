import { expect, it } from 'vitest';
import { ManualClock, deterministicIds } from '../fixtures/harness.js';
import { gamePackSchema } from '../../packages/contracts/src/pack.js';
import { twoPromptPack, roundOne } from '../fixtures/game.js';

it('can replay exact receipt millisecond boundaries without sleeping', () => {
  const clock = new ManualClock();
  const now = clock.now;
  const receipt = [24_999, 25_000, 25_001].map(at => {
    clock.set(at);
    return now();
  });
  expect(receipt).toEqual([24_999, 25_000, 25_001]);
  expect(() => clock.set(10)).toThrow(RangeError);
});

it('can replay the same identifiers in a fresh test', () => {
  const run = () => {
    const next = deterministicIds();
    return [next('game'), next('round'), next('round')];
  };
  expect(run()).toEqual(['game-1', 'round-2', 'round-3']);
  expect(run()).toEqual(run());
});

it('supplies an explicit distinct zero-point acceptance and miss scenario', () => {
  const pack = gamePackSchema.parse(twoPromptPack());
  expect(pack.prompts).toHaveLength(2);
  expect(roundOne.accepted.slice(-2)).toEqual([true, false]);
  expect(roundOne.points.slice(-2)).toEqual([0, 0]);
  expect(roundOne.unusedExample).toBe(pack.prompts[0]!.answers[2]!.text);
});
