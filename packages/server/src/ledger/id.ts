import { z } from 'zod';

/**
 * A check's id in the ledger, which is its address.
 *
 * A slug rather than the uuid the database keeps, because this id is written by
 * hand into a check's file and quoted by the workflow that records a run
 * against it, and by `canfail.json`. Nobody types a uuid into a workflow input
 * correctly twice. The uuid the database sees is derived from this, in
 * identity.ts, so the two never have to be kept in step by anybody.
 *
 * It is the address rather than the name beside it, and the two have
 * different jobs. The name is a label a reader sees, written with spaces and
 * capitals and free to change; the id is what a workflow input and
 * `canfail.json` quote, and changing it is not a rename but a new check, which
 * every run naming the old id is then refused against. A run resolves to its
 * check by this and by nothing else, so renaming a check leaves its runs where
 * they are. Ruled on #71.
 */
export const ledgerIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The longest an id may be.
 *
 * It is also a filename stem, so it stays well inside every filesystem's limit
 * with room for a directory in front of it.
 */
export const MAX_LEDGER_ID_LENGTH = 100;

const idMessage =
  'An id is lower-case letters, digits and single hyphens, such as ci-lint.';

export const ledgerIdSchema = z
  .string()
  .max(MAX_LEDGER_ID_LENGTH, {
    error: `An id can be at most ${String(MAX_LEDGER_ID_LENGTH)} characters.`,
    abort: true,
  })
  .regex(ledgerIdPattern, { error: idMessage, abort: true });
