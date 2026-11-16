import type { GamePackInput } from '../../packages/contracts/src/pack.js';

export const privatePackMarker = 'Inkfin private fixture';

export function twoPromptPack(): GamePackInput {
  return {
    schemaVersion: 1,
    title: 'Harbour quiz',
    tiers: [
      { id: 'rare', name: 'Rare', points: 50 },
      { id: 'ordinary', name: 'Ordinary', points: 0 }
    ],
    prompts: [
      { id: 'fish', text: 'Name a fish.', answers: [
        { text: privatePackMarker, tierId: 'rare', aliases: ['Ink fin'] },
        { text: 'Haddock', tierId: 'ordinary' },
        { text: 'Turbot', tierId: 'rare' },
        { text: 'Wrasse', tierId: 'rare' }
      ] },
      { id: 'birds', text: 'Name a seabird.', answers: [
        { text: 'Gannet', tierId: 'rare' },
        { text: 'Gull', tierId: 'ordinary' }
      ] }
    ]
  };
}

// Independently specified oracle for E2-S05/S06/S09. A null entry is a miss.
export const roundOne = {
  submissions: ['ink fin', 'Inkfin private fixture', 'Haddock', null],
  accepted: [true, true, true, false],
  points: [50, 50, 0, 0],
  ranks: [1, 1, 3, 3],
  groupedCounts: [[privatePackMarker, 2], ['Haddock', 1]],
  unusedExample: 'Turbot'
} as const;

export function longTextPack(): GamePackInput {
  const pack = twoPromptPack();
  pack.title = '🐟'.repeat(256);
  const first = pack.prompts[0]!;
  first.text = 'p'.repeat(4096);
  first.answers[0]!.text = '🐟'.repeat(512);
  first.answers[0]!.aliases = ['a'.repeat(512)];
  return pack;
}

export const invalidPackCases = [
  { field: 'unknown field', path: ['settings', 'readingSecond'], change(pack: GamePackInput) {
    return { ...pack, settings: { readingSecond: 3 } };
  } },
  { field: 'missing tier', path: ['prompts', 0, 'answers', 0, 'tierId'], change(pack: GamePackInput) {
    pack.prompts[0]!.answers[0]!.tierId = 'misspelled';
    return pack;
  } },
  { field: 'unsafe total', path: ['prompts'], change(pack: GamePackInput) {
    pack.tiers[0]!.points = Number.MAX_SAFE_INTEGER;
    return pack;
  } }
] as const;

// These packs pass shape validation. E2-S01 must reject each ambiguous key.
export function conflictingAliasPack(): GamePackInput {
  const pack = twoPromptPack();
  pack.prompts[0]!.answers[1]!.aliases = ['  INK\u2003 FIN  '];
  return pack;
}
