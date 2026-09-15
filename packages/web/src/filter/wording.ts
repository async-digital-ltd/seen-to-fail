import type { Condition } from '@seen-to-fail/filter';

import { counted } from '../days';

/**
 * The words the filter bar uses for the language: one for each field, one for
 * each operator, and the three parts a chip is read as.
 *
 * Both tables are typed from the language's own union. A field or an operator
 * added to the language and not here stops this compiling, and so does a word
 * invented here for an operator the language does not have. The bar's picker
 * offers exactly these, so the picker's choices and the chips' words are one
 * list.
 */

/** The fields a condition can be on. */
export type Field = Condition['field'];

/** The operators one field has. */
export type OperatorOf<F extends Field> = Extract<
  Condition,
  { readonly field: F }
>['op'];

/** The fields in the order the picker offers them. */
export const FIELDS = ['status', 'area', 'lastCaught', 'runs'] as const;

export const fieldWords = {
  status: 'status',
  area: 'area',
  lastCaught: 'last caught',
  runs: 'runs',
} as const satisfies Record<Field, string>;

/** A word for every operator of every field, and for nothing else. */
type OperatorWords = {
  readonly [F in Field]: Readonly<Record<OperatorOf<F>, string>>;
};

/**
 * The dated operators are worded from the reader's side. `before` some number
 * of days back is a catch longer ago than that; `after` is a catch within it.
 */
const operatorWords: OperatorWords = {
  status: { is: 'is', isNot: 'is not' },
  area: { is: 'is', isNot: 'is not' },
  lastCaught: {
    never: 'never',
    before: 'longer ago than',
    after: 'within the last',
  },
  runs: { moreThan: 'more than', fewerThan: 'fewer than' },
};

/**
 * The word for one operator of one field, as the picker's list of operators
 * shows it.
 *
 * The operator arrives as text, because it is read off a select. The select
 * only ever offers `operatorsOf` the same field, so the throw is for a pairing
 * the picker cannot make, and it names the pair rather than showing a blank.
 */
export function operatorWord(field: Field, operator: string): string {
  const words: Readonly<Record<string, string | undefined>> =
    operatorWords[field];
  const word = words[operator];
  if (word === undefined) {
    throw new Error(`The ${field} field has no ${operator} operator.`);
  }
  return word;
}

/**
 * The operators one field has, in the order the picker offers them.
 *
 * The keys of the table above are the operators, so the assertion says no
 * more than the table's type already does. The result is a non-empty tuple
 * because a picker opening on a field needs an operator to open with, and
 * every field has at least one; the throw names the table a reader would have
 * to have emptied for it to fire.
 */
export function operatorsOf<F extends Field>(
  field: F,
): readonly [OperatorOf<F>, ...OperatorOf<F>[]] {
  const [first, ...rest] = Object.keys(operatorWords[field]) as OperatorOf<F>[];
  if (first === undefined) {
    throw new Error(`operatorWords lists no operator for ${field}.`);
  }
  return [first, ...rest];
}

/** A condition in three words, as a chip shows it. */
export interface ConditionWords {
  readonly field: string;
  readonly operator: string;
  /** What the condition compares against, or undefined for `never`. */
  readonly value: string | undefined;
}

export function describeCondition(condition: Condition): ConditionWords {
  switch (condition.field) {
    case 'status':
      return {
        field: fieldWords.status,
        operator: operatorWords.status[condition.op],
        value: condition.value,
      };
    case 'area':
      return {
        field: fieldWords.area,
        operator: operatorWords.area[condition.op],
        value: condition.value,
      };
    case 'lastCaught':
      return {
        field: fieldWords.lastCaught,
        operator: operatorWords.lastCaught[condition.op],
        value:
          condition.op === 'never' ? undefined : counted(condition.days, 'day'),
      };
    case 'runs':
      return {
        field: fieldWords.runs,
        operator: operatorWords.runs[condition.op],
        value: String(condition.count),
      };
  }
}

/** A condition as one phrase, such as "status is Unproven". */
export function conditionPhrase(condition: Condition): string {
  const { field, operator, value } = describeCondition(condition);
  return value === undefined
    ? `${field} ${operator}`
    : `${field} ${operator} ${value}`;
}
