import { z } from 'zod';

import { isRealDay } from '../day.ts';
import {
  checkRunProvenance,
  checkRunSettlement,
  issuesFrom,
  MAX_LABEL_LENGTH,
  MAX_TEXT_LENGTH,
  optionalInconclusiveReason,
  optionalNote,
  optionalSourceCommit,
  optionalSourceRunUrl,
  optionalText,
  requiredText,
  runSource,
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
 * `canfail.json` quote, and changing it is not a rename but a new check, which every run
 * naming the old id is then refused against. A run resolves to its check by
 * this and by nothing else, so renaming a check leaves its runs where they
 * are. Ruled on #71.
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

/**
 * A record with no source is a record from before runs carried one, and every
 * one of those was typed in by a person.
 *
 * The only key here with a default, and it is here so that the records already
 * committed stay valid exactly as they were written. Rewriting them to add the
 * key would change each file's digest, which is its name, which is its
 * identity: an append-only record would have quietly rewritten its own past to
 * make a new rule look as though it had always held.
 *
 * It is not a hole in the rule. A replay that left its source out carries a
 * commit and a link, and reading it as hand-written then refuses it on both of
 * those, so the only record this default can silently mislabel is one with no
 * evidence of a replay in it at all.
 */
const recordedBeforeSourcesExisted = 'hand';

function ledgerRunSchema(today: IsoDate) {
  return z
    .strictObject({
      checkId: ledgerId(),
      runOn: ledgerDay(today, 'A run cannot be dated after today.'),
      planted: requiredText('Say what was planted.', MAX_TEXT_LENGTH),
      expected: requiredText(
        'Say what the check was expected to do.',
        MAX_TEXT_LENGTH,
      ),
      outcome: z.enum(testRunOutcomes),
      // Absent on every record written before a run could settle nothing, and
      // absent is what a run that settled something has to be. No default is
      // needed for either: the field reads as null when it is left out, which
      // is what those records mean and what the rule below requires of them.
      inconclusiveReason: optionalInconclusiveReason,
      note: optionalNote,
      source: runSource.default(recordedBeforeSourcesExisted),
      sourceCommit: optionalSourceCommit,
      sourceRunUrl: optionalSourceRunUrl,
    })
    .superRefine(checkRunProvenance)
    .superRefine(checkRunSettlement);
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
