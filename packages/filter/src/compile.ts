import type { Condition, Filter, Group, Joiner } from './types';

/**
 * The compiler: a parsed filter becomes a parameterised SQL predicate.
 *
 * Two properties are the whole point of this module. A value never appears in
 * the text it returns; values travel in `values` and the text refers to each
 * one by `$n`. And the two levels of the language survive the translation:
 * every group is parenthesised, so a filter that means `(a OR b) AND (c)`
 * cannot come out as `a OR b AND c`, which SQL would read as `a OR (b AND c)`.
 *
 * The predicate is written against the summaries query, where `s` is a row of
 * `check_summaries` and `c` is the `checks` row it was derived from. Those two
 * aliases are the only thing this module knows about the query it is spliced
 * into. It imports no database driver and no server code, so the web client
 * can hold the same compiler without pulling a connection pool behind it.
 */

/**
 * Where in the surrounding query's placeholder numbering a compiled filter
 * sits. Both numbers are a Postgres `$n`, which counts from one, rather than
 * an array index.
 */
export interface CompileOptions {
  /**
   * The first placeholder the compiler may claim for a value of its own. The
   * caller's own parameters come before it, so a query that already binds the
   * as-of date and the staleness threshold passes 3.
   */
  readonly firstParam: number;
  /**
   * The placeholder that already carries the as-of date. The dated
   * `lastCaught` operators measure their day count back from it rather than
   * from `current_date`, so a test can pin the date and get the same answer
   * every run.
   *
   * It is taken as an option rather than assumed to be `$1` because nothing in
   * this package can check that assumption. A wrong guess would still compile,
   * still run, and quietly answer a different question.
   */
  readonly asOfParam: number;
}

/** A predicate and the values its placeholders stand for, in order. */
export interface CompiledFilter {
  /**
   * A complete boolean expression, meant to be spliced as `WHERE <where>`. A
   * caller that joins it to another predicate has to parenthesise it first,
   * because the groups are parenthesised but the joiner between them is not.
   */
  readonly where: string;
  /**
   * The values the placeholders stand for, in placeholder order. The caller
   * appends them to its own parameters, which is what makes `firstParam`
   * correct.
   */
  readonly values: readonly unknown[];
}

/**
 * What the empty filter compiles to. The empty filter hides nothing, and a
 * predicate that is always true is how that is said in the one place the query
 * has for saying it.
 */
const MATCHES_EVERY_CHECK = 'TRUE';

/** How a joiner in the language is spelled in SQL. */
const SQL_JOINERS = { and: 'AND', or: 'OR' } as const;

/** How `is` and `is not` compare, for the two fields that take them. */
const MATCH_OPERATORS = { is: '=', isNot: '<>' } as const;

/**
 * How the dated `lastCaught` operators compare against the as-of date.
 *
 * Both exclude a check that has never been caught, because a comparison with
 * NULL is never true. That is deliberate rather than incidental: `never` is
 * the operator for that case, and a filter that wants both says so by joining
 * the two with OR.
 */
const AGE_OPERATORS = { before: '<', after: '>' } as const;

/** How the two `runs` operators compare against a count. */
const COUNT_OPERATORS = { moreThan: '>', fewerThan: '<' } as const;

/**
 * Refuse a case the types say cannot arrive.
 *
 * The call is reachable only if the condition union grows a member and this
 * file is not updated to match, and TypeScript rejects that at build time
 * because a widened union no longer fits the `never` parameter. The throw is
 * what is left if the build-time refusal is bypassed, for example by a value
 * that reached the compiler without going through `parseFilter`.
 */
function refuseUnknownCase(value: never, what: string): never {
  throw new Error(
    `The compiler has no case for ${what}: ${JSON.stringify(value)}`,
  );
}

/**
 * Compile one condition, claiming a placeholder for each value it carries.
 *
 * `addValue` records a value and hands back the `$n` that stands for it, so
 * the numbering is a consequence of the order conditions are compiled in and
 * cannot drift from the values array.
 */
function compileCondition(
  condition: Condition,
  addValue: (value: unknown) => string,
  asOf: string,
): string {
  switch (condition.field) {
    case 'status':
      return `s.status ${MATCH_OPERATORS[condition.op]} ${addValue(
        condition.value,
      )}`;
    case 'area':
      return `c.area ${MATCH_OPERATORS[condition.op]} ${addValue(
        condition.value,
      )}`;
    case 'lastCaught':
      switch (condition.op) {
        case 'never':
          return 's.last_caught_on IS NULL';
        case 'before':
        case 'after':
          // Both placeholders are cast because Postgres resolves a parameter's
          // type from how it is used, and `$1 - $3` on its own gives it
          // nothing to work from: date minus integer, date minus date and date
          // minus interval are all real operators, so the subtraction is
          // ambiguous rather than merely untyped.
          return `s.last_caught_on ${AGE_OPERATORS[condition.op]} ${asOf}::date - ${addValue(
            condition.days,
          )}::integer`;
        default:
          return refuseUnknownCase(condition, 'a lastCaught operator');
      }
    case 'runs':
      return `s.run_count ${COUNT_OPERATORS[condition.op]} ${addValue(
        condition.count,
      )}`;
    default:
      return refuseUnknownCase(condition, 'a condition field');
  }
}

/**
 * Compile one group, parentheses included.
 *
 * A single-condition group is parenthesised too. The parentheses are not there
 * to be tidy, they are there so that the joiner between groups cannot be
 * captured by the joiner inside one, and a group of one is the case where that
 * is easiest to forget.
 */
function compileGroup(
  group: Group,
  addValue: (value: unknown) => string,
  asOf: string,
): string {
  const conditions = group.conditions.map((condition) =>
    compileCondition(condition, addValue, asOf),
  );
  return `(${conditions.join(joinedBy(group.joiner))})`;
}

/** The SQL joiner with the spaces that separate it from its operands. */
function joinedBy(joiner: Joiner): string {
  return ` ${SQL_JOINERS[joiner]} `;
}

/**
 * Compile a filter into a predicate and its values.
 *
 * Pure: the same filter and the same options give the same text and the same
 * values every time, which is what lets the unit tests assert the text in full
 * rather than pattern-match at it.
 */
export function compileFilter(
  filter: Filter,
  options: CompileOptions,
): CompiledFilter {
  const values: unknown[] = [];
  const addValue = (value: unknown): string => {
    values.push(value);
    return `$${String(options.firstParam + values.length - 1)}`;
  };
  const asOf = `$${String(options.asOfParam)}`;

  switch (filter.kind) {
    case 'empty':
      return { where: MATCHES_EVERY_CHECK, values };
    case 'groups': {
      const groups = filter.groups.map((group) =>
        compileGroup(group, addValue, asOf),
      );
      return { where: groups.join(joinedBy(filter.joiner)), values };
    }
    default:
      return refuseUnknownCase(filter, 'a filter kind');
  }
}
