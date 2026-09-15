import { expect, it } from 'vitest';

import { numberInWords, numberInWordsCapitalised } from './words';

it('writes zero to twelve as words', () => {
  expect(numberInWords(0)).toBe('zero');
  expect(numberInWords(1)).toBe('one');
  expect(numberInWords(8)).toBe('eight');
  expect(numberInWords(12)).toBe('twelve');
});

it('writes thirteen and beyond as digits', () => {
  expect(numberInWords(13)).toBe('13');
  expect(numberInWords(120)).toBe('120');
});

it('capitalises the word for the start of a sentence, and leaves digits be', () => {
  expect(numberInWordsCapitalised(8)).toBe('Eight');
  expect(numberInWordsCapitalised(13)).toBe('13');
});
