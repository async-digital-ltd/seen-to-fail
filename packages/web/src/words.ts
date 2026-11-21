import type { PlantKind } from './graphql/generated/graphql';

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

/**
 * Each kind of planted defect by the name the check page gives it (#295).
 * A complete record over the API's kinds, so a kind added there fails to
 * compile here until it has a name.
 */
export const plantKindNames: Readonly<Record<PlantKind, string>> = {
  WRONG_ANSWER: 'Wrong answer',
  MISSING_CASE: 'Missing case',
  CRASH: 'Crash',
  SECURITY: 'Security',
  CONFIGURATION: 'Configuration',
  DEPENDENCY: 'Dependency',
};

/** The same, for the start of a sentence: "Eight" for 8. */
export function numberInWordsCapitalised(count: number): string {
  const text = numberInWords(count);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
