import { emptyFilter, parseFilter } from '@seen-to-fail/filter';
import type { Filter } from '@seen-to-fail/filter';
import { GraphQLError, GraphQLScalarType } from 'graphql';

/**
 * The filter argument: where a filter crosses from a request into the server.
 *
 * Two halves, and the split between them is the point. The scalar lets any JSON
 * through, untouched and typed as unknown. It does not validate, because the
 * filter language already has exactly one validator, `parseFilter`, and a
 * second set of rules here would be a second definition of the language to keep
 * in step with the first. The function below is where that validator runs, and
 * it is the only route from the argument to a `Filter`. The query that lists
 * checks takes a `Filter` and nothing looser, so input that has not been through
 * here cannot reach SQL without a type error on the way.
 */

/**
 * The FilterInput scalar: any JSON value, passed on as it arrived.
 *
 * A value sent as a variable arrives already parsed from the request body. A
 * value written into the query text is turned into the same plain JSON by
 * graphql's default for a scalar with no literal coercion of its own, so the
 * two spellings of one filter reach the resolver as equal values. The one
 * leniency that default brings is that a bare word in the query text, which
 * GraphQL reads as an enum value, arrives as a string; that is harmless, since
 * whatever arrives is still judged by `parseFilter`.
 */
export const filterInputScalar = new GraphQLScalarType<unknown, unknown>({
  name: 'FilterInput',
  description: 'A filter over the list of checks, written as JSON.',
  coerceInputValue: (inputValue) => inputValue,
});

/**
 * The filter a request asked for, or a GraphQL error naming every bad node.
 *
 * No argument, or a null one, is the empty filter: a list nobody has narrowed
 * shows every check. Anything else goes to `parseFilter`, and a rejection
 * becomes an error whose `extensions.errors` is the validator's own list of
 * paths and messages, so a client can show each message beside the part of the
 * filter it is about. The error is thrown before the resolver has touched the
 * database, which is what the query-counting test holds it to.
 */
export function filterFromArgument(argument: unknown): Filter {
  if (argument === null || argument === undefined) {
    return emptyFilter;
  }

  const parsed = parseFilter(argument);
  if (!parsed.ok) {
    throw new GraphQLError(
      'The filter is not one the filter language can express.',
      { extensions: { errors: parsed.errors } },
    );
  }
  return parsed.filter;
}
