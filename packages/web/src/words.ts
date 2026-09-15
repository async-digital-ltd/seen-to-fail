/**
 * Numbers as prose writes them: words up to twelve, digits after that. For a
 * sentence rather than a figure, so a tile count or a result line keeps its
 * digits.
 */

const words = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];

/** "eight" for 8, and "13" for 13. */
export function numberInWords(count: number): string {
  return words[count] ?? String(count);
}

/** The same, for the start of a sentence: "Eight" for 8. */
export function numberInWordsCapitalised(count: number): string {
  const text = numberInWords(count);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
