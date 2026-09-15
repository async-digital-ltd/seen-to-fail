import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';
import type { ConstValueNode } from 'graphql';

import type { IsoDate } from '../database/rows.ts';

/**
 * The Date scalar: a calendar day, written as YYYY-MM-DD.
 *
 * Days are days in this product, not instants. A run is dated and never timed,
 * and the record has no finer grain than that, so the wire format is a day and
 * the internal representation is the same text. Nothing here builds a
 * JavaScript Date: that is an instant, and turning a day into one means picking
 * a time zone to place it in, after which two readers in different places
 * disagree about which day it was.
 *
 * So the scalar is a validator rather than a converter. What comes out of the
 * database is already YYYY-MM-DD, because the column lists format it in SQL,
 * and what goes out on the wire is the same string. The work is refusing
 * everything else, in both directions and for different reasons: bad input is
 * somebody else's mistake and gets a message they can act on, while a bad
 * output is this server's own mistake and the check is there to catch it before
 * a reader is handed something the schema promised was a day.
 */

/** The shape, which is necessary and not sufficient. */
const dayShape = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether the text is a day that exists.
 *
 * The shape alone accepts 2026-02-30 and 2026-13-01, which are not days. The
 * round trip is what rejects them: parsing places the text at midnight UTC, and
 * a day that does not exist lands on a different one, so formatting the result
 * back gives different text. A month out of range does not parse at all.
 */
function isRealDay(value: string): boolean {
  if (!dayShape.test(value)) {
    return false;
  }
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return new Date(parsed).toISOString().slice(0, 10) === value;
}

/** What to say about a value that is not a day, without quoting it back raw. */
function refuse(value: unknown, direction: string): GraphQLError {
  const shown = typeof value === 'string' ? `"${value}"` : typeof value;
  return new GraphQLError(
    `Date ${direction} a day written as YYYY-MM-DD, and got ${shown}.`,
  );
}

/**
 * Checks a day on its way out to a reader.
 *
 * A failure here is a bug in this server rather than in a request, so it throws
 * instead of returning null: a field the schema says is a Date handing back
 * something else is exactly the kind of thing that is easier to fix the first
 * time it happens than the fiftieth time somebody wonders why a date looks odd.
 */
function coerceOutputValue(outputValue: unknown): IsoDate {
  if (typeof outputValue !== 'string' || !isRealDay(outputValue)) {
    throw refuse(outputValue, 'was asked to return');
  }
  return outputValue;
}

/** Checks a day arriving as a variable. */
function coerceInputValue(inputValue: unknown): IsoDate {
  if (typeof inputValue !== 'string' || !isRealDay(inputValue)) {
    throw refuse(inputValue, 'expects');
  }
  return inputValue;
}

/**
 * Checks a day written into the query text itself.
 *
 * Only a string literal can be one. A number or an enum name reaching here is
 * refused by kind before its contents are looked at, so the message says what
 * was written rather than what it might have meant.
 */
function coerceInputLiteral(valueNode: ConstValueNode): IsoDate {
  if (valueNode.kind !== Kind.STRING) {
    throw new GraphQLError(
      `Date expects a day written as YYYY-MM-DD in quotes, and got a ${valueNode.kind}.`,
      { nodes: valueNode },
    );
  }
  if (!isRealDay(valueNode.value)) {
    throw new GraphQLError(
      `Date expects a day written as YYYY-MM-DD, and got "${valueNode.value}".`,
      { nodes: valueNode },
    );
  }
  return valueNode.value;
}

export const dateScalar = new GraphQLScalarType<IsoDate, IsoDate>({
  name: 'Date',
  description: 'A calendar day, written as YYYY-MM-DD.',
  coerceOutputValue,
  coerceInputValue,
  coerceInputLiteral,
});
