import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gamePackSchema, packFieldErrors, type GamePackInput } from '../../packages/contracts/src/pack.js';
import { twoPromptPack, longTextPack, invalidPackCases, conflictingAliasPack } from '../fixtures/game.js';

function expectInvalid(input: unknown, path: (string | number)[]) {
  const result = gamePackSchema.safeParse(input);
  if (result.success) throw new Error('Expected a validation failure at ' + JSON.stringify(path));
  expect(packFieldErrors(result.error).map(issue => issue.path)).toContainEqual(path);
}

describe('game file contract', () => {
  it('validates the identical public release, PRD and standalone examples', () => {
    const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');
    const releaseExample = JSON.parse(read('../../examples/game.example.json'));
    expect(releaseExample).toEqual(JSON.parse(read('../../docs/game.example.json')));
    expect(releaseExample).toEqual(JSON.parse(read('../../apps/web/public/game.example.json')));
    const fence = read('../../docs/PRD.md').match(/\n```json\n([\s\S]+?)\n```/);
    expect(releaseExample).toEqual(JSON.parse(fence![1]!));
    expect(gamePackSchema.parse(releaseExample).prompts[0]?.answers[2]?.aliases).toEqual(['Fall']);
  });

  it('applies per-field defaults and preserves raw canonical display', () => {
    const pack = twoPromptPack();
    delete pack.title;
    pack.settings = { answerSeconds: 1.001 };
    pack.prompts[0]!.answers[0]!.text = '  CAFÉ  ';
    const parsed = gamePackSchema.parse(pack);
    expect(parsed.title).toBe('Custom Game');
    expect(parsed.settings).toEqual({ readingSeconds: 3, answerSeconds: 1.001, resultsSeconds: 10 });
    expect(parsed.prompts[0]!.answers[0]!.text).toBe('  CAFÉ  ');
    expect(parsed.prompts[0]!.answers[1]!.aliases).toEqual([]);
    delete pack.settings;
    expect(gamePackSchema.parse(pack).settings).toEqual({ readingSeconds: 3, answerSeconds: 25, resultsSeconds: 10 });
  });

  it('accepts inclusive text, duration and prompt boundaries', () => {
    const pack = longTextPack();
    pack.title = '  ' + pack.title + '\u0085';
    pack.settings = { readingSeconds: 0.1, answerSeconds: 600 };
    pack.prompts = Array.from({ length: 20 }, (_, i) => ({ ...pack.prompts[0]!, id: 'p' + i }));
    expect(gamePackSchema.parse(pack).title).toBe('🐟'.repeat(256));
    pack.prompts.push({ ...pack.prompts[0]!, id: 'extra' });
    expectInvalid(pack, ['prompts']);
  });

  it.each(invalidPackCases)('reports $field precisely', ({ change, path }) => {
    expectInvalid(change(twoPromptPack()), [...path]);
  });

  it.each([0.099, 600.001, 1.0001, 0.10000000000000002, Infinity, NaN])('rejects duration %s', value => {
    expectInvalid({ ...twoPromptPack(), settings: { readingSeconds: value } }, ['settings', 'readingSeconds']);
  });

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects tier points %s', points => {
    const pack = twoPromptPack();
    pack.tiers[0]!.points = points;
    expectInvalid(pack, ['tiers', 0, 'points']);
  });

  it('checks reachable total across actual prompts and preserves zero', () => {
    const pack = twoPromptPack();
    pack.tiers.push({ id: 'unused', name: 'Unused', points: Number.MAX_SAFE_INTEGER });
    expect(gamePackSchema.parse(pack).tiers[1]!.points).toBe(0);
    pack.prompts = [pack.prompts[0]!];
    pack.tiers[0]!.points = Number.MAX_SAFE_INTEGER;
    expect(gamePackSchema.safeParse(pack).success).toBe(true);
  });

  it.each([
    [[], 'extra'], [['settings'], 'timers'], [['prompts', 0], 'media'], [['tiers', 0], 'color'],
    [['prompts', 0, 'answers', 0], 'image']
  ] as [Array<string | number>, string][])('returns the exact extra field at %s', (parts, extra) => {
    const pack = { ...twoPromptPack(), settings: {} };
    const object: Record<string, unknown> = parts.reduce<Record<string, unknown>>(
      (node, part) => node[part] as Record<string, unknown>, pack);
    object[extra] = 1;
    expectInvalid(pack, [...parts, extra]);
  });

  const cases: [string, (p: GamePackInput) => void, (string | number)[]][] = [
    ['blank title', p => { p.title = '\u0085\t'; }, ['title']],
    ['long title', p => { p.title = '🐟'.repeat(257); }, ['title']],
    ['long tier name', p => { p.tiers[0]!.name = 'x'.repeat(129); }, ['tiers', 0, 'name']],
    ['blank tier ID', p => { p.tiers[0]!.id = ' '; }, ['tiers', 0, 'id']],
    ['duplicate tier ID', p => { p.tiers[1]!.id = 'rare'; }, ['tiers', 1, 'id']],
    ['duplicate prompt ID', p => { p.prompts[1]!.id = 'fish'; }, ['prompts', 1, 'id']],
    ['long ID', p => { p.prompts[0]!.id = 'x'.repeat(65); }, ['prompts', 0, 'id']],
    ['long prompt', p => { p.prompts[0]!.text = 'x'.repeat(4097); }, ['prompts', 0, 'text']],
    ['empty answers', p => { p.prompts[0]!.answers = []; }, ['prompts', 0, 'answers']],
    ['blank answer', p => { p.prompts[0]!.answers[0]!.text = '\t'; }, ['prompts', 0, 'answers', 0, 'text']],
    ['long answer', p => { p.prompts[0]!.answers[0]!.text = 'a'.repeat(513); }, ['prompts', 0, 'answers', 0, 'text']],
    ['long alias', p => { p.prompts[0]!.answers[0]!.aliases = ['🐟'.repeat(513)]; }, ['prompts', 0, 'answers', 0, 'aliases', 0]],
    ['blank alias', p => { p.prompts[0]!.answers[0]!.aliases = ['\u2003']; }, ['prompts', 0, 'answers', 0, 'aliases', 0]],
    ['empty tiers', p => { p.tiers = []; }, ['tiers']],
    ['empty prompts', p => { p.prompts = []; }, ['prompts']]
  ];
  it.each(cases)('rejects %s', (_name, change, path) => {
    const pack = twoPromptPack();
    change(pack);
    expectInvalid(pack, path);
  });

  it('distinguishes missing and unsupported format versions', () => {
    const { schemaVersion, ...body } = twoPromptPack();
    expect(schemaVersion).toBe(1);
    expectInvalid(body, ['schemaVersion']);
    expectInvalid({ ...body, schemaVersion: 2 }, ['schemaVersion']);
  });

  it('accepts variable answer and alias counts while deferring key collisions to E2', () => {
    const pack = twoPromptPack();
    pack.prompts[0]!.answers = Array.from({ length: 1200 }, (_, i) => ({
      text: 'word' + i, tierId: 'rare', aliases: Array.from({ length: i % 9 }, (_, j) => 'alias' + i + '-' + j)
    }));
    expect(gamePackSchema.parse(pack).prompts[0]!.answers).toHaveLength(1200);
    expect(gamePackSchema.safeParse(conflictingAliasPack()).success).toBe(true);
  });
});
