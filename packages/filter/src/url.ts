import { parseFilter } from './parse.ts';
import type { FilterIssue, ParseFilterResult } from './parse.ts';
import type { Condition, Filter, Group } from './types.ts';

/**
 * The filter as it travels in a link, under the `f` query parameter.
 *
 * Two promises hold this file together. A filter always writes itself the same
 * way, so two people looking at the same filter get the same link to paste. And
 * a link only ever becomes a filter by going through `parseFilter`, so the
 * query string is not a second door into the language with its own, weaker
 * rules: all this file decides is which object to hand the one validator.
 *
 * The grammar is readable on purpose. `packages/filter/README.md` is its
 * reference; the short version is a joiner, then groups, each group a joiner
 * and then its conditions:
 *
 *     and!or*status.is.Unproven*status.is.Stale!and*area.is.CI
 *
 * Both joiners are written out even when a list holds a single item, because
 * the joiner is part of the filter's value and dropping it would lose on the
 * way back what the filter held on the way out.
 */

/** The whole filter, when it hides nothing. */
const EVERYTHING = 'all';

/**
 * Separates the filter's joiner from its groups, and the groups from one
 * another.
 */
const GROUP_SEPARATOR = '!';

/**
 * Separates a group's joiner from its conditions, and the conditions from one
 * another.
 */
const CONDITION_SEPARATOR = '*';

/** Separates a condition's field, operator and argument. */
const PART_SEPARATOR = '.';

/** Introduces an escaped code unit inside a value. */
const ESCAPE = '~';

/**
 * Every character a serialised filter is allowed to use.
 *
 * This is the set `encodeURIComponent` leaves untouched, which is a stricter
 * promise than merely being legal in a query string. A link built by hand and
 * the same link built with a standard encoder come out identical, so nothing
 * turns into `%3B` on the way to somebody's chat window. Obvious separators
 * such as `;` and `,` are legal in a query and would read better, but every
 * standard encoder escapes them, so they lose the property this grammar is for.
 *
 * The gate runs before anything is taken apart, so the rest of this file only
 * ever handles characters from this set.
 */
const ALPHABET = /^[A-Za-z0-9.!*~_-]*$/;

/** The characters a value keeps as they are. Everything else is escaped. */
const NOT_LITERAL = /[^A-Za-z0-9_-]/g;

/** A value: literal characters and escapes, and nothing else. */
const VALUE = /^(?:[A-Za-z0-9_-]|~[0-9A-F]{4})*$/;

/** One escape inside an already validated value. */
const ESCAPED_UNIT = /~[0-9A-F]{4}/g;

/**
 * A whole number with one spelling: no sign, no leading zero, no separators.
 *
 * Accepting `007` as well as `7` would give one filter two links, which is the
 * one thing a share link must not have.
 */
const WHOLE_NUMBER = /^(?:0|[1-9][0-9]*)$/;

/** How many hexadecimal digits an escape carries. */
const ESCAPE_DIGITS = 4;

/**
 * Write a value so that it uses only the grammar's alphabet.
 *
 * Letters, digits, hyphens and underscores survive as themselves, which keeps
 * an ordinary area name such as `ci` readable in the link. Everything else,
 * including the separators and the escape character itself, becomes a tilde and
 * the four hexadecimal digits of its UTF-16 code unit.
 *
 * Working a code unit at a time rather than a code point at a time is what
 * makes this total: an unpaired surrogate is a string JavaScript can hold, and
 * it comes back exactly as it went in rather than throwing or being replaced.
 */
function encodeValue(value: string): string {
  return value.replace(NOT_LITERAL, (unit) => {
    const code = unit.charCodeAt(0).toString(16).toUpperCase();
    return ESCAPE + code.padStart(ESCAPE_DIGITS, '0');
  });
}

/**
 * Read a value back, or report that the token is not one.
 *
 * The whole token is checked against the grammar before any substitution runs,
 * so a stray tilde, a half-written escape, or an escape in lower case is a
 * refusal rather than a value with a surprise in it. Lower case is refused
 * because it would be a second way to write a value that already has one.
 */
function decodeValue(token: string): string | undefined {
  if (!VALUE.test(token)) {
    return undefined;
  }
  return token.replace(ESCAPED_UNIT, (escaped) =>
    String.fromCharCode(Number.parseInt(escaped.slice(1), 16)),
  );
}

/**
 * The token that names one field-and-operator pair, for every pair the language
 * has.
 *
 * The conditional is what makes this distribute over the union: without it the
 * template would pair every field with every operator and admit combinations
 * such as `area.moreThan` that the language does not have.
 */
type TokenFor<C extends Condition> = C extends Condition
  ? `${C['field']}.${C['op']}`
  : never;

type ConditionToken = TokenFor<Condition>;

/** What a condition writes after its operator, and the key it reads back into. */
type ArgumentSpec =
  | { readonly holds: 'nothing' }
  | { readonly holds: 'text'; readonly key: 'value' }
  | { readonly holds: 'wholeNumber'; readonly key: 'days' | 'count' };

/**
 * The one place the grammar and the types meet.
 *
 * Typing it as a record over `ConditionToken` is the guard: give `types.ts` a
 * new operator and this table stops compiling until the operator has a token,
 * and invent a token here for an operator the language does not have and it
 * stops compiling too. That is why the parser reads from a table while the
 * serialiser below is a switch. Each side is checked by the compiler in its own
 * direction, and the round-trip property test proves the two agree.
 */
const ARGUMENTS: Record<ConditionToken, ArgumentSpec> = {
  'status.is': { holds: 'text', key: 'value' },
  'status.isNot': { holds: 'text', key: 'value' },
  'area.is': { holds: 'text', key: 'value' },
  'area.isNot': { holds: 'text', key: 'value' },
  'lastCaught.never': { holds: 'nothing' },
  'lastCaught.before': { holds: 'wholeNumber', key: 'days' },
  'lastCaught.after': { holds: 'wholeNumber', key: 'days' },
  'runs.moreThan': { holds: 'wholeNumber', key: 'count' },
  'runs.fewerThan': { holds: 'wholeNumber', key: 'count' },
};

/**
 * The same table, ready to be asked about a token that arrived from a link.
 *
 * A `Map` rather than the record itself, because the record can only be indexed
 * by a token the language has, and the whole question here is whether this one
 * is. A map also has no inherited keys, so a token such as `constructor` is a
 * miss rather than a hit on something from the prototype.
 */
const ARGUMENT_BY_TOKEN = new Map<string, ArgumentSpec>(
  Object.entries(ARGUMENTS),
);

/**
 * Write a filter as the text that goes in a share link.
 *
 * Deterministic: the result depends on nothing but the filter, so the same
 * filter gives the same link every time and on every machine. Two filters that
 * mean the same thing but list their groups in a different order are different
 * filters here and get different links, which is the honest answer, because the
 * order is part of what the person built.
 */
export function serializeFilter(filter: Filter): string {
  if (filter.kind === 'empty') {
    return EVERYTHING;
  }
  const groups = filter.groups.map(serializeGroup);
  return [filter.joiner, ...groups].join(GROUP_SEPARATOR);
}

function serializeGroup(group: Group): string {
  const conditions = group.conditions.map(serializeCondition);
  return [group.joiner, ...conditions].join(CONDITION_SEPARATOR);
}

/**
 * Every operator writes its own name, so no two conditions can come out as the
 * same text. `runs.moreThan.5` and `runs.fewerThan.5` differ in the only place
 * they could, which is the whole point of giving the operator a token of its
 * own rather than, say, a comparison sign shared between fields.
 */
function serializeCondition(condition: Condition): string {
  switch (condition.field) {
    case 'status':
      return `status.${condition.op}.${encodeValue(condition.value)}`;
    case 'area':
      return `area.${condition.op}.${encodeValue(condition.value)}`;
    case 'lastCaught':
      return condition.op === 'never'
        ? 'lastCaught.never'
        : `lastCaught.${condition.op}.${String(condition.days)}`;
    case 'runs':
      return `runs.${condition.op}.${String(condition.count)}`;
  }
}

/** A condition read off a link, still untyped, or the reason it was refused. */
type ConditionRead =
  | { readonly ok: true; readonly condition: unknown }
  | { readonly ok: false; readonly message: string };

function refuse(message: string): ConditionRead {
  return { ok: false, message };
}

const NOT_A_CONDITION =
  'A condition reads as a field and an operator separated by a dot, with its value after a further dot where the operator takes one.';

/**
 * Turn one condition token into the object shape the language describes, or say
 * why it is not a condition.
 *
 * The result is deliberately `unknown`. Nothing here decides that a value is
 * acceptable, only which key it belongs under; whether `Passing` is a status or
 * `-1` is a day count is `parseFilter`'s answer, given once, for every door into
 * the language.
 */
function readCondition(token: string): ConditionRead {
  const segments = token.split(PART_SEPARATOR);
  const [field, operator, argument] = segments;

  // `split` always returns at least one part, so a missing field means an empty
  // token and a missing operator means there was no dot at all. Both are the
  // same refusal, and asking about them here is also what tells TypeScript the
  // two are strings from this point on.
  if (field === undefined || operator === undefined || segments.length > 3) {
    return refuse(NOT_A_CONDITION);
  }

  const name = field + PART_SEPARATOR + operator;
  const spec = ARGUMENT_BY_TOKEN.get(name);
  if (spec === undefined) {
    return refuse(`This filter language has no ${name} condition.`);
  }

  switch (spec.holds) {
    case 'nothing':
      if (argument !== undefined) {
        return refuse(`The ${name} condition takes no value.`);
      }
      return { ok: true, condition: { field, op: operator } };

    case 'text': {
      if (argument === undefined) {
        return refuse(`The ${name} condition needs a value.`);
      }
      const value = decodeValue(argument);
      if (value === undefined) {
        return refuse(
          'A value is written with letters, digits, hyphens and underscores, and anything else as a tilde followed by four upper case hexadecimal digits.',
        );
      }
      return {
        ok: true,
        condition: { field, op: operator, [spec.key]: value },
      };
    }

    case 'wholeNumber': {
      if (argument === undefined) {
        return refuse(`The ${name} condition needs a whole number.`);
      }
      if (!WHOLE_NUMBER.test(argument)) {
        return refuse(
          `The ${name} condition counts in digits, with no sign, no leading zero and no separators.`,
        );
      }
      const count = Number(argument);
      if (!Number.isSafeInteger(count)) {
        return refuse(
          'That number is larger than this filter language counts to.',
        );
      }
      return {
        ok: true,
        condition: { field, op: operator, [spec.key]: count },
      };
    }
  }
}

function rejected(path: string, message: string): ParseFilterResult {
  return { ok: false, errors: [{ path, message }] };
}

const NOT_A_FILTER = `A filter reads as a joiner and then its groups, such as and${GROUP_SEPARATOR}or${CONDITION_SEPARATOR}status.is.Unproven${CONDITION_SEPARATOR}status.is.Stale, or the single word ${EVERYTHING} when it hides nothing.`;

/**
 * Turn the text from a share link back into a filter.
 *
 * Takes `unknown` for the same reason `parseFilter` does: a query parameter is
 * whatever the caller found in the URL, and that is the kind of claim worth
 * checking rather than trusting. Nothing here throws, whatever the text holds:
 * a malformed link comes back as the same rejection shape as a malformed
 * request body, with the path naming the group and condition at fault so a
 * caller can say which part of a shared filter went missing.
 *
 * Only the shape is read here. The candidate is handed to `parseFilter` for the
 * verdict, so a link cannot carry anything the API would refuse.
 */
export function parseFilterString(text: unknown): ParseFilterResult {
  if (typeof text !== 'string') {
    return rejected('', 'A share link carries its filter as text.');
  }
  if (!ALPHABET.test(text)) {
    return rejected(
      '',
      'A filter in a link is written with letters, digits and the characters . ! * ~ _ and - only.',
    );
  }
  if (text === EVERYTHING) {
    return parseFilter({ kind: 'empty' });
  }

  const firstSeparator = text.indexOf(GROUP_SEPARATOR);
  if (firstSeparator < 0) {
    return rejected('', NOT_A_FILTER);
  }
  const joiner = text.slice(0, firstSeparator);
  const groupTokens = text.slice(firstSeparator + 1).split(GROUP_SEPARATOR);

  const groups: unknown[] = [];
  const errors: FilterIssue[] = [];

  groupTokens.forEach((groupToken, groupIndex) => {
    const separator = groupToken.indexOf(CONDITION_SEPARATOR);
    const groupJoiner =
      separator < 0 ? groupToken : groupToken.slice(0, separator);
    const conditionTokens =
      separator < 0
        ? []
        : groupToken.slice(separator + 1).split(CONDITION_SEPARATOR);

    const conditions: unknown[] = [];
    conditionTokens.forEach((conditionToken, conditionIndex) => {
      const read = readCondition(conditionToken);
      if (read.ok) {
        conditions.push(read.condition);
        return;
      }
      errors.push({
        path: `groups[${String(groupIndex)}].conditions[${String(conditionIndex)}]`,
        message: read.message,
      });
    });

    groups.push({ joiner: groupJoiner, conditions });
  });

  // A token that is not a condition has no object to stand for it, so the
  // candidate would be missing a node and `parseFilter` would report the hole
  // rather than the reason for it. These refusals go back as they are, and a
  // link with nothing wrong at this level goes on to the one validator.
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return parseFilter({ kind: 'groups', joiner, groups });
}
