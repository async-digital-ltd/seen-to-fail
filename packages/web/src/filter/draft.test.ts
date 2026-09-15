import { describe, expect, it } from 'vitest';

import type { Draft } from './draft';
import { conditionFrom } from './draft';

function draft(parts: Partial<Draft>): Draft {
  return { field: 'status', operator: 'is', text: '', number: '', ...parts };
}

describe('a draft that describes a condition', () => {
  it('becomes that condition', () => {
    expect(
      conditionFrom(
        draft({ field: 'status', operator: 'isNot', text: 'Stale' }),
      ),
    ).toEqual({
      ok: true,
      condition: { field: 'status', op: 'isNot', value: 'Stale' },
    });
    expect(
      conditionFrom(draft({ field: 'area', operator: 'is', text: 'CI' })),
    ).toEqual({
      ok: true,
      condition: { field: 'area', op: 'is', value: 'CI' },
    });
    expect(
      conditionFrom(draft({ field: 'lastCaught', operator: 'never' })),
    ).toEqual({ ok: true, condition: { field: 'lastCaught', op: 'never' } });
    expect(
      conditionFrom(
        draft({ field: 'lastCaught', operator: 'before', number: '30' }),
      ),
    ).toEqual({
      ok: true,
      condition: { field: 'lastCaught', op: 'before', days: 30 },
    });
    expect(
      conditionFrom(
        draft({ field: 'runs', operator: 'fewerThan', number: '0' }),
      ),
    ).toEqual({
      ok: true,
      condition: { field: 'runs', op: 'fewerThan', count: 0 },
    });
  });

  it('keeps an area exactly as it was typed', () => {
    expect(
      conditionFrom(draft({ field: 'area', operator: 'is', text: 'ci ' })),
    ).toEqual({
      ok: true,
      condition: { field: 'area', op: 'is', value: 'ci ' },
    });
  });
});

describe('a draft with a gap', () => {
  it('names the gap rather than reading it as a value', () => {
    expect(conditionFrom(draft({ field: 'status' }))).toEqual({
      ok: false,
      message: 'Choose a status.',
    });
    expect(conditionFrom(draft({ field: 'area' }))).toEqual({
      ok: false,
      message: 'Enter an area.',
    });
    // Spaces alone are the one text no check's area can be, by the table's
    // own rule, so they are the same gap rather than a value nothing matches.
    expect(conditionFrom(draft({ field: 'area', text: '   ' }))).toEqual({
      ok: false,
      message: 'Enter an area.',
    });
    expect(
      conditionFrom(draft({ field: 'lastCaught', operator: 'after' })),
    ).toEqual({ ok: false, message: 'Enter a number of days.' });
    expect(
      conditionFrom(draft({ field: 'runs', operator: 'moreThan' })),
    ).toEqual({ ok: false, message: 'Enter a number of runs.' });
  });
});

/**
 * The refusals below are the language's, word for word. The draft does not
 * restate the rules; the test that a negative count is refused is a test that
 * the draft went through the language at all.
 */
describe('a draft the language refuses', () => {
  it("is refused in the language's words", () => {
    expect(
      conditionFrom(
        draft({ field: 'lastCaught', operator: 'before', number: '-1' }),
      ),
    ).toEqual({ ok: false, message: 'A day count cannot be negative.' });
    expect(
      conditionFrom(
        draft({ field: 'runs', operator: 'moreThan', number: '2.5' }),
      ),
    ).toEqual({
      ok: false,
      message: 'A run count must be a whole number of runs.',
    });
  });

  it('never becomes a condition', () => {
    const refused: Draft[] = [
      draft({ field: 'status', text: 'Passing' }),
      draft({ field: 'status', operator: 'was', text: 'Proven' }),
      draft({ field: 'lastCaught', operator: 'before', number: 'soon' }),
      draft({ field: 'lastCaught', operator: 'before', number: '1e400' }),
      draft({ field: 'runs', operator: 'moreThan', number: '-0.5' }),
    ];

    for (const candidate of refused) {
      const result = conditionFrom(candidate);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).not.toBe('');
      }
    }
  });
});
