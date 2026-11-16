// Unicode White_Space consists entirely of BMP characters. Scanning from each
// end leaves internal display whitespace intact, even for very long strings.
const whitespace = /\p{White_Space}/u;

export function trimOuterWhitespace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && whitespace.test(value.charAt(start))) start++;
  while (end > start && whitespace.test(value.charAt(end - 1))) end--;
  return value.slice(start, end);
}

export function collapseWhitespace(value: string): string {
  return trimOuterWhitespace(value).replace(/\p{White_Space}+/gu, ' ');
}

export function matchingKey(value: string): string {
  return collapseWhitespace(value.normalize('NFC')).toLowerCase();
}

export function codePointCount(value: string): number {
  let count = 0;
  for (const _character of value) count++;
  return count;
}
