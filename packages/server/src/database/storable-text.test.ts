import { parseFilter } from '@seen-to-fail/filter';
import { expect, it } from 'vitest';

import { storable } from './new-records.ts';

/**
 * The write path's rule for text and the filter's rule for an area are two
 * copies of one predicate (#161). The filter package cannot import the server,
 * and holds the filter language and nothing else, so neither copy can import
 * the other. This holds them to the same answers instead.
 *
 * The filter's copy is asked through `parseFilter`, the way every filter
 * reaches it, with the text as the value of the only condition. Nothing else
 * in that filter can be refused, so its verdict is the area rule's.
 *
 * The inputs are one shared table: every UTF-16 code unit on its own, which
 * catches either copy refusing a character the other accepts without anyone
 * adding a row for it, and every ordered pair from a set of units either side
 * of the surrogate ranges, which catches the two disagreeing about what makes
 * a pair.
 */

function areaFilter(text: string): unknown {
  return {
    kind: 'groups',
    joiner: 'and',
    groups: [
      {
        joiner: 'and',
        conditions: [{ field: 'area', op: 'is', value: text }],
      },
    ],
  };
}

function filterAccepts(text: string): boolean {
  return parseFilter(areaFilter(text)).ok;
}

const everyCodeUnit = Array.from({ length: 0x1_0000 }, (_, unit) =>
  String.fromCharCode(unit),
);

/**
 * Units at and either side of each edge that matters: NUL, the last unit
 * before the surrogates, the first and last high surrogate, the first and last
 * low surrogate, the first unit after them, and U+FFFD, which is what the
 * driver sends in place of a surrogate on its own.
 */
const edges = [
  'a',
  '\u0000',
  '퟿',
  '\uD800',
  '\uDBFF',
  '\uDC00',
  '\uDFFF',
  '',
  '�',
];

const everyPairOfEdges = edges.flatMap((first) =>
  edges.map((second) => first + second),
);

/** Texts longer than a pair, with the characters at fault inside them. */
const longer = [
  '',
  'CI',
  'C\u0000I',
  'C\uD800I',
  'C\uDC00I',
  '😀',
  '😀\uD83D',
  '\uDE00😀',
];

const sharedTable = [...everyCodeUnit, ...everyPairOfEdges, ...longer];

/** A text's code units in hexadecimal, so a disagreement can be read. */
function codeUnits(text: string): string {
  return Array.from({ length: text.length }, (_, index) =>
    text.charCodeAt(index).toString(16).toUpperCase().padStart(4, '0'),
  ).join(' ');
}

it('gives the same answer from both copies for every text in the shared table', () => {
  const disagreements = sharedTable
    .filter((text) => filterAccepts(text) !== storable(text))
    .map(codeUnits);

  expect(disagreements).toStrictEqual([]);
});

/**
 * The positive control for the test above: two copies that accepted
 * everything, or refused everything, would agree on every row. On its own a
 * code unit is refused only when it is NUL or one of the 2,048 surrogates.
 */
it('refuses 2,049 of the 65,536 code units on their own: NUL and every surrogate', () => {
  const refused = everyCodeUnit.filter((text) => !storable(text));

  expect(refused.length).toBe(2_049);
  expect(refused.filter((text) => !filterAccepts(text)).length).toBe(2_049);
});
