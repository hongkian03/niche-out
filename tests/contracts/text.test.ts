import { describe, expect, it } from 'vitest';
import { codePointCount, collapseWhitespace, matchingKey, trimOuterWhitespace } from '../../packages/contracts/src/text.js';

describe('comparison keys and display strings', () => {
  it('normalizes canonically equivalent accents and Unicode whitespace', () => {
    const raw = '\u0085 CAFE\u0301\u00a0\u2003 Noir\n';
    expect(matchingKey(raw)).toBe('café noir');
    expect(raw).toContain('CAFE\u0301');
    expect(collapseWhitespace(raw)).toBe('CAFE\u0301 Noir');
    expect(trimOuterWhitespace('  Game   Night\u00a0')).toBe('Game   Night');
  });

  it.each([
    ['Café', 'Cafe'], ['north-east', 'north east'], ['Ａ', 'A'], ['ß', 'ss'],
    ['İ', 'I'], ['blue', 'bleu'], ['one\u200btwo', 'one two']
  ])('preserves the distinction between %s and %s', (left, right) => {
    expect(matchingKey(left)).not.toBe(matchingKey(right));
  });

  it('counts Unicode code points before any matching transformation', () => {
    expect(codePointCount('🐟e\u0301')).toBe(3);
    expect(matchingKey('İ')).toBe('i\u0307');
  });
});
