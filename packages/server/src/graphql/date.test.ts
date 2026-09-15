import { GraphQLError, Kind } from 'graphql';
import type { ConstValueNode } from 'graphql';
import { describe, expect, it } from 'vitest';

import { dateScalar } from './date.ts';

/**
 * What the Date scalar accepts and what it refuses, in both directions.
 *
 * The scalar is the only thing standing between "a day" as this product means
 * it and every other way a date can be written down, so the tests that matter
 * are the refusals. A scalar that accepted a timestamp would hand a reader a
 * value the schema said was a day, and a scalar that accepted 2026-02-30 would
 * let a date that does not exist into the record.
 *
 * Nothing here reads the clock. Every day below is written out, so a test that
 * passes today passes on any day.
 */

/** A string literal as it reaches a scalar from the query text. */
function literal(value: string): ConstValueNode {
  return { kind: Kind.STRING, value, block: false };
}

describe('on the way out', () => {
  it('returns a day unchanged', () => {
    expect(dateScalar.coerceOutputValue('2026-03-01')).toBe('2026-03-01');
  });

  it('returns the first and last days of a year unchanged', () => {
    expect(dateScalar.coerceOutputValue('2026-01-01')).toBe('2026-01-01');
    expect(dateScalar.coerceOutputValue('2026-12-31')).toBe('2026-12-31');
  });

  it('returns the extra day of a leap year unchanged', () => {
    expect(dateScalar.coerceOutputValue('2028-02-29')).toBe('2028-02-29');
  });

  it('refuses a timestamp, rather than quietly dropping the time', () => {
    expect(() => dateScalar.coerceOutputValue('2026-03-01T09:30:00Z')).toThrow(
      GraphQLError,
    );
  });

  it('refuses a day that does not exist', () => {
    expect(() => dateScalar.coerceOutputValue('2026-02-30')).toThrow(
      GraphQLError,
    );
    expect(() => dateScalar.coerceOutputValue('2027-02-29')).toThrow(
      GraphQLError,
    );
  });

  it('refuses a month and a day that are out of range', () => {
    expect(() => dateScalar.coerceOutputValue('2026-13-01')).toThrow(
      GraphQLError,
    );
    expect(() => dateScalar.coerceOutputValue('2026-00-10')).toThrow(
      GraphQLError,
    );
    expect(() => dateScalar.coerceOutputValue('2026-03-32')).toThrow(
      GraphQLError,
    );
  });

  it('refuses a day written any other way round', () => {
    expect(() => dateScalar.coerceOutputValue('01/03/2026')).toThrow(
      GraphQLError,
    );
    expect(() => dateScalar.coerceOutputValue('2026-3-1')).toThrow(
      GraphQLError,
    );
  });

  it('refuses something that is not text at all', () => {
    expect(() => dateScalar.coerceOutputValue(20260301)).toThrow(GraphQLError);
    expect(() => dateScalar.coerceOutputValue(null)).toThrow(GraphQLError);
    expect(() =>
      dateScalar.coerceOutputValue(new Date('2026-03-01T00:00:00Z')),
    ).toThrow(GraphQLError);
  });

  it('says what it was given, so the message is worth reading', () => {
    expect(() => dateScalar.coerceOutputValue('the first of March')).toThrow(
      /"the first of March"/,
    );
  });
});

describe('on the way in, as a variable', () => {
  it('returns a day unchanged', () => {
    expect(dateScalar.coerceInputValue('2026-03-01')).toBe('2026-03-01');
  });

  it('refuses a day that does not exist', () => {
    expect(() => dateScalar.coerceInputValue('2026-02-30')).toThrow(
      GraphQLError,
    );
  });

  it('refuses a timestamp and anything that is not text', () => {
    expect(() => dateScalar.coerceInputValue('2026-03-01T09:30:00Z')).toThrow(
      GraphQLError,
    );
    expect(() => dateScalar.coerceInputValue(20260301)).toThrow(GraphQLError);
  });

  /**
   * JavaScript parses year 0000 as a real day and PostgreSQL refuses it, so a
   * scalar that let it through would send a value the database cannot store.
   * The first day of year 0001 is the other side of the same line.
   */
  it('refuses year 0000, which the database has no room for, and accepts year 0001', () => {
    expect(() => dateScalar.coerceInputValue('0000-01-01')).toThrow(
      GraphQLError,
    );
    expect(() => dateScalar.coerceInputValue('0000-12-31')).toThrow(
      GraphQLError,
    );
    expect(dateScalar.coerceInputValue('0001-01-01')).toBe('0001-01-01');
  });
});

describe('on the way in, written into the query', () => {
  it('returns a day unchanged', () => {
    expect(dateScalar.coerceInputLiteral?.(literal('2026-03-01'))).toBe(
      '2026-03-01',
    );
  });

  it('refuses a day that does not exist', () => {
    expect(() =>
      dateScalar.coerceInputLiteral?.(literal('2026-02-30')),
    ).toThrow(GraphQLError);
  });

  it('refuses year 0000, and accepts year 0001', () => {
    expect(() =>
      dateScalar.coerceInputLiteral?.(literal('0000-01-01')),
    ).toThrow(GraphQLError);
    expect(dateScalar.coerceInputLiteral?.(literal('0001-01-01'))).toBe(
      '0001-01-01',
    );
  });

  it('refuses a literal that is not a string, by its kind', () => {
    expect(() =>
      dateScalar.coerceInputLiteral?.({ kind: Kind.INT, value: '20260301' }),
    ).toThrow(/IntValue/);
  });
});
