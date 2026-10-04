import { describe, expect, it } from 'vitest';

import { invalidFields, placeErrors, summarySentence } from './field-errors';

const fields = ['name', 'area', 'protects'] as const;

describe('placing the API errors', () => {
  it('puts each message on the field its path names', () => {
    expect(
      placeErrors(fields, [
        { path: 'area', message: 'A check needs an area.' },
        { path: 'name', message: 'A check needs a name.' },
      ]),
    ).toEqual({
      byField: {
        name: 'A check needs a name.',
        area: 'A check needs an area.',
      },
      unplaced: [],
    });
  });

  it('keeps the first message when a field is named twice', () => {
    expect(
      placeErrors(fields, [
        { path: 'name', message: 'First.' },
        { path: 'name', message: 'Second.' },
      ]).byField,
    ).toEqual({ name: 'First.' });
  });

  it('keeps a message whose path names no field apart', () => {
    expect(
      placeErrors(fields, [{ path: 'colour', message: 'Not a field.' }]),
    ).toEqual({ byField: {}, unplaced: ['Not a field.'] });
  });
});

it('lists the fields at fault in form order, whatever order they were found in', () => {
  expect(invalidFields(fields, { protects: 'Three.', name: 'One.' })).toEqual([
    'name',
    'protects',
  ]);
});

describe('the summary line', () => {
  it('spells out a single detail', () => {
    expect(summarySentence(1)).toBe(
      'One detail needs attention. It is marked below.',
    );
  });

  it('counts several', () => {
    expect(summarySentence(3)).toBe(
      '3 details need attention. They are marked below.',
    );
  });
});
