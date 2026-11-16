import { describe, expect, it } from 'vitest';
import {
  compilePack, hydrateTrustedCompiledPack, isCompiledPack, PackCompilationError, serializeCompiledPack,
} from '../../packages/game-core/src/compile.js';
import { twoPromptPack, conflictingAliasPack, invalidPackCases, longTextPack } from '../fixtures/game.js';

function errorsFor(input: unknown) {
  try {
    compilePack(input);
  } catch (error) {
    if (error instanceof PackCompilationError) return error.errors;
    throw error;
  }
  throw new Error('Expected compilation to reject this pack.');
}

describe('canonical pack compiler', () => {
  it('maps Autumn and explicit Fall alias to one canonical scoring object', () => {
    const compiled = compilePack({ schemaVersion: 1, tiers: [{ id: 'rare', name: 'Rare', points: 100 }],
      prompts: [{ id: 'seasons', text: 'Name a season.', answers: [
        { text: 'Autumn', tierId: 'rare', aliases: ['Fall'] },
      ] }] });
    const prompt = compiled.prompts[0];
    expect(prompt.match('  FALL ')).toBe(prompt.match('autumn'));
    expect(prompt.match('Fall')).toEqual({ id: 'answer-0-0', index: 0, text: 'Autumn', tierId: 'rare', tierName: 'Rare', points: 100 });
    expect(prompt.match('Autum')).toBeUndefined();
    expect(compiled.settings).toEqual({ readingSeconds: 3, answerSeconds: 25, resultsSeconds: 10 });
    expect(compiled.title).toBe('Custom Game');
  });

  it('preserves display, prompt and answer order while normalizing NFC/case/Unicode whitespace', () => {
    const source = twoPromptPack();
    source.prompts[0].answers[0].text = '  CAFÉ\tFIN  ';
    const compiled = compilePack(source);
    expect(compiled.prompts.map(prompt => prompt.id)).toEqual(['fish', 'birds']);
    expect(compiled.prompts[0].answers.map(answer => answer.text)).toEqual(['  CAFÉ\tFIN  ', 'Haddock', 'Turbot', 'Wrasse']);
    expect(compiled.prompts[0].match('\u2003cafe\u0301  fin\u0085')).toBe(compiled.prompts[0].answers[0]);
    expect(compiled.prompts[0].match('cafe fin')).toBeUndefined();
    expect(compiled.prompts[0].match('café-fin')).toBeUndefined();
    expect(compiled.prompts[0].match('ＣＡＦÉ FIN')).toBeUndefined();
  });

  it('deduplicates equivalent aliases for the same answer, including canonical repeats', () => {
    const source = twoPromptPack();
    source.prompts[0].answers[0].aliases = ['Ink fin', ' INK\u2003FIN ', 'Inkfin private fixture'];
    const compiled = compilePack(source);
    expect(compiled.prompts[0].match('ink fin')).toBe(compiled.prompts[0].answers[0]);
    expect(serializeCompiledPack(compiled).prompts[0].lookup).toHaveLength(5);
  });

  it('reports the conflicting alias field precisely', () => {
    expect(errorsFor(conflictingAliasPack())).toEqual([{ path: ['prompts', 0, 'answers', 1, 'aliases', 0],
      message: 'This normalized answer or alias is already assigned to answer 1.' }]);
  });

  it('rejects duplicate canonical answers even when their tiers agree', () => {
    const source = twoPromptPack();
    source.prompts[0].answers.push({ text: ' INKFIN\u2003PRIVATE FIXTURE ', tierId: 'rare' });
    expect(errorsFor(source).map(error => error.path)).toContainEqual(['prompts', 0, 'answers', 4, 'text']);
  });

  it('rejects an earlier alias that shadows a later canonical answer', () => {
    const source = twoPromptPack();
    source.prompts[0].answers[0].aliases = ['haddock'];
    expect(errorsFor(source).map(error => error.path)).toContainEqual(['prompts', 0, 'answers', 1, 'text']);
  });

  it('keeps matching indexes separate between prompts', () => {
    const source = twoPromptPack();
    source.prompts[1].answers[0].aliases = ['Haddock'];
    const compiled = compilePack(source);
    expect(compiled.prompts[0].match('Haddock')?.text).toBe('Haddock');
    expect(compiled.prompts[1].match('Haddock')?.text).toBe('Gannet');
  });

  it.each(invalidPackCases)('rejects invalid $field with shared contract field paths', ({ change, path }) => {
    expect(errorsFor(change(twoPromptPack())).map(error => error.path)).toContainEqual([...path]);
  });

  it('rejects duplicate prompt and tier IDs', () => {
    const source = twoPromptPack();
    source.prompts[1].id = source.prompts[0].id;
    source.tiers.push({ ...source.tiers[0] });
    const paths = errorsFor(source).map(error => error.path);
    expect(paths).toContainEqual(['prompts', 1, 'id']);
    expect(paths).toContainEqual(['tiers', 2, 'id']);
  });

  it('preserves zero points and computes the sum of reachable per-prompt maxima', () => {
    const source = twoPromptPack();
    source.tiers.push({ id: 'unused', name: 'Unused', points: Number.MAX_SAFE_INTEGER });
    source.prompts[1].answers = [{ text: 'Zero', tierId: 'ordinary' }];
    const compiled = compilePack(source);
    expect(compiled.maximumTotalPoints).toBe(50);
    expect(compiled.prompts[1].match('zero')?.points).toBe(0);
    source.prompts = [source.prompts[0]];
    source.tiers[0].points = Number.MAX_SAFE_INTEGER;
    expect(compilePack(source).maximumTotalPoints).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('accepts arbitrary string keys without prototype-property hazards', () => {
    const source = twoPromptPack();
    source.prompts[0].answers[0].aliases = ['__proto__', 'constructor', 'toString'];
    const prompt = compilePack(source).prompts[0];
    expect(prompt.match('__proto__')).toBe(prompt.answers[0]);
    expect(prompt.match('constructor')).toBe(prompt.answers[0]);
    expect(prompt.match('toString')).toBe(prompt.answers[0]);
    expect(prompt.match('hasOwnProperty')).toBeUndefined();
  });

  it('supports contract length limits and variable answer sets without truncating', () => {
    expect(compilePack(longTextPack()).prompts[0].match('a'.repeat(512))?.text).toBe('🐟'.repeat(512));
    const source = twoPromptPack();
    source.prompts[0].answers = Array.from({ length: 1200 }, (_, index) => ({
      text: 'word' + index, tierId: 'rare', aliases: ['alias' + index],
    }));
    const prompt = compilePack(source).prompts[0];
    expect(prompt.answers).toHaveLength(1200);
    expect(prompt.match('ALIAS1199')).toBe(prompt.answers[1199]);
  });

  it('isolates the compiled definition from input and consumer mutation', () => {
    const source = twoPromptPack();
    const compiled = compilePack(source);
    source.tiers[0].points = 999;
    source.prompts[0].answers[0].aliases!.push('Changed');
    source.prompts[0].answers[0].text = 'Changed';
    expect(compiled.prompts[0].match('ink fin')?.points).toBe(50);
    expect(compiled.prompts[0].match('Changed')).toBeUndefined();
    expect(() => Object.assign(compiled.prompts[0].answers[0], { points: 999 })).toThrow(TypeError);
    expect(() => Object.assign(compiled.settings, { answerSeconds: 600 })).toThrow(TypeError);
    expect(() => Object.assign(compiled.prompts, { 0: null })).toThrow(TypeError);
    expect(Object.keys(compiled.prompts[0])).not.toContain('lookup');
    expect(isCompiledPack(compiled)).toBe(true);
    expect(isCompiledPack({ ...compiled })).toBe(false);
    expect(isCompiledPack(null)).toBe(false);
    expect(() => serializeCompiledPack({ ...compiled })).toThrow(TypeError);
  });

  it('transfers worker compilation through structured cloning and restores immutable private indexes', () => {
    const compiled = compilePack(twoPromptPack());
    const workerData = serializeCompiledPack(compiled);
    expect(() => Object.assign(workerData.prompts[0].lookup[0], { 0: 'bad' })).toThrow(TypeError);
    const transferred = structuredClone(workerData);
    const restored = hydrateTrustedCompiledPack(transferred);
    expect(isCompiledPack(restored)).toBe(true);
    expect(serializeCompiledPack(restored)).toEqual(workerData);
    expect(restored.prompts[0].match('INK FIN')).toBe(restored.prompts[0].answers[0]);
    Object.assign(transferred.prompts[0].lookup[0], { 0: 'bad' });
    Object.assign(transferred.prompts[0].answers[0], { points: 1234 });
    expect(restored.prompts[0].match('ink fin')?.points).toBe(50);
    expect(restored.prompts[0].match('bad')).toBeUndefined();
    expect(() => Object.assign(restored.prompts[0].answers[0], { points: 1 })).toThrow(TypeError);
  });
});
