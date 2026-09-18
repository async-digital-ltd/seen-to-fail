import { z } from 'zod';

import { isRealDay } from '../day.ts';
import {
  issuesFrom,
  MAX_LABEL_LENGTH,
  MAX_TEXT_LENGTH,
  optionalNote,
  optionalText,
  requiredText,
} from '../database/new-records.ts';
import type { ParseResult, RecordIssue } from '../database/new-records.ts';
import { testRunOutcomes } from '../database/rows.ts';
import type { IsoDate } from '../database/rows.ts';

/**
 * What a file in the ledger has to be before anything loads it.
 *
 * The ledger is the published record: a directory of JSON files in this
 * repository, one file per thing recorded. A job records a run by adding a
 * file, which is why these rules matter more than the ones on a form. A form is
 * filled in by somebody who sees the error and tries again; a file is written
 * by a job and lands in a commit, so a record that is wrong in a way nothing
 * refuses is a record that will be published as if it were true.
 *
 * The text rules are the form's own rules, imported rather than restated, so a
 * value the form refuses cannot reach the database by this route instead.
 *
 * Every schema is strict. An unknown key is refused rather than dropped,
 * because a misspelled `outcome` silently ignored is a run published with no
 * outcome at all, and a record that quietly loses a field it was written with
 * is precisely the failure this project exists to make visible.
 */

/**
 * A check's id in the ledger.
 *
 * A slug rather than the uuid the database keeps, because this id is written by
 * hand into a check's file and quoted by a job in another repository that wants
 * to record a run against it. Nobody types a uuid into a workflow input
 * correctly twice. The uuid the database sees is derived from this, in
 * identity.ts, so the two never have to be kept in step by anybody.
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

function ledgerId() {
  return z
    .string()
    .max(MAX_LEDGER_ID_LENGTH, {
      error: `An id can be at most ${String(MAX_LEDGER_ID_LENGTH)} characters.`,
      abort: true,
    })
    .regex(ledgerIdPattern, { error: idMessage, abort: true });
}

/**
 * A day that exists, and is not after the day the ledger is being read on.
 *
 * Both halves are refused here rather than by PostgreSQL. The column would take
 * 2026-02-30 as far as a parse error, and the future-dated rule is a check
 * constraint that fires at insert time, which is after the file has been
 * committed. Refusing here is what makes the workflow's validation step mean
 * something: the record never lands.
 */
function ledgerDay(today: IsoDate, futureMessage: string) {
  return z
    .string()
    .refine(isRealDay, {
      error: 'A day is written as YYYY-MM-DD.',
      abort: true,
    })
    .refine((day) => day <= today, { error: futureMessage, abort: true });
}

function ledgerCheckSchema() {
  return z.strictObject({
    id: ledgerId(),
    name: requiredText('A check needs a name.', MAX_LABEL_LENGTH),
    area: requiredText('A check needs an area.', MAX_LABEL_LENGTH),
    protects: optionalText(MAX_TEXT_LENGTH),
    howToTellArmed: optionalText(MAX_TEXT_LENGTH),
  });
}

function ledgerRunSchema(today: IsoDate) {
  return z.strictObject({
    checkId: ledgerId(),
    runOn: ledgerDay(today, 'A run cannot be dated after today.'),
    planted: requiredText('Say what was planted.', MAX_TEXT_LENGTH),
    expected: requiredText(
      'Say what the check was expected to do.',
      MAX_TEXT_LENGTH,
    ),
    outcome: z.enum(testRunOutcomes),
    note: optionalNote,
  });
}

function ledgerObservationSchema(today: IsoDate) {
  return z.strictObject({
    checkId: ledgerId(),
    observedOn: ledgerDay(today, 'An observation cannot be dated after today.'),
    armed: z.boolean(),
    note: optionalNote,
  });
}

const checkSchema = ledgerCheckSchema();

/** A check, as a file in the ledger records it. */
export type LedgerCheck = z.output<typeof checkSchema>;

/** One planted defect and what the check did about it. */
export type LedgerRun = z.output<ReturnType<typeof ledgerRunSchema>>;

/** Dated evidence about whether a check is switched on at all. */
export type LedgerObservation = z.output<
  ReturnType<typeof ledgerObservationSchema>
>;

function parseWith<Value>(
  result: z.ZodSafeParseResult<Value>,
): ParseResult<Value> {
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: issuesFrom(result.error) };
}

/** A check record, or every rule it breaks. */
export function parseLedgerCheck(input: unknown): ParseResult<LedgerCheck> {
  return parseWith(checkSchema.safeParse(input));
}

/** A run record, or every rule it breaks, judged as of a day. */
export function parseLedgerRun(
  input: unknown,
  today: IsoDate,
): ParseResult<LedgerRun> {
  return parseWith(ledgerRunSchema(today).safeParse(input));
}

/** An observation record, or every rule it breaks, judged as of a day. */
export function parseLedgerObservation(
  input: unknown,
  today: IsoDate,
): ParseResult<LedgerObservation> {
  return parseWith(ledgerObservationSchema(today).safeParse(input));
}

export type { ParseResult, RecordIssue };
