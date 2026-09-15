import { z } from 'zod';

import { uuidPattern } from './checks.ts';
import { testRunOutcomes } from './rows.ts';
import type { IsoDate } from './rows.ts';

/**
 * What a new check, run or observation has to be before it is written, and the
 * only way to get one.
 *
 * The rules here are the ones a reader of the input can apply without asking
 * the database: a required field is not blank, a day is not after today, and a
 * check id is at least shaped like one. Each schema ends in a brand, and the
 * writes take the branded type, so a value that has not been through one of the
 * parse functions below cannot reach an insert without a type error on the way.
 *
 * Two rules cannot be applied here, because only the database knows the answer:
 * whether a name is already in use, and whether a check exists under an id. The
 * writes leave both to the constraints that already enforce them and turn the
 * refusal into the same kind of issue, using the two issues defined below, so a
 * caller cannot tell which side of the insert a rule
 * was applied on and does not need to.
 *
 * The shape of the input is not checked again here. Every caller is a GraphQL
 * resolver, and by the time one runs GraphQL has already refused a missing
 * field, a value of the wrong type and a Date that is not a day. A second copy
 * of those rules here could never be seen to refuse anything.
 */

/**
 * One reason an input was refused.
 *
 * `path` names the input field at fault, spelled the way the input spells it,
 * such as `runOn`. The same shape the filter language reports its issues in, so
 * a client that can show one beside a field can show the other.
 */
export interface RecordIssue {
  readonly path: string;
  readonly message: string;
}

/** A value that passed every rule, or every rule it broke. */
export type ParseResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly errors: readonly RecordIssue[] };

/** What a writer says when the database finds a name already in use. */
export const nameTaken: RecordIssue = {
  path: 'name',
  message: 'There is already a check with this name.',
};

/**
 * What is said about a check id that names no check, whichever side of the
 * insert found that out.
 */
export const noSuchCheck: RecordIssue = {
  path: 'checkId',
  message: 'There is no check with this id.',
};

/**
 * Text a person has to fill in.
 *
 * Trimmed before it is measured and stored trimmed, so a field of nothing but
 * spaces is as blank here as it is to every reader, and two names that differ
 * only in a trailing space are the same name when the database compares them.
 */
function requiredText(message: string) {
  return z.string().trim().min(1, message);
}

/**
 * A note nobody has to write.
 *
 * A blank one is stored as no note. An empty string and a null would otherwise
 * be two ways of recording that nobody wrote anything, and a reader would have
 * to be told they mean the same.
 */
const optionalNote = z
  .string()
  .trim()
  .nullish()
  .transform((note) =>
    note === undefined || note === null || note === '' ? null : note,
  );

/**
 * A day that is not after today.
 *
 * Compared as text. Both sides are YYYY-MM-DD, which the Date scalar has already
 * insisted on for the input and which the request context holds for today, and
 * text in that shape sorts in the same order as the days it names.
 *
 * Today is passed in rather than read from the clock, so it is the same day the
 * statuses in the response are read as of. A rule that read the clock again
 * could accept a run on one side of midnight and report its check's status from
 * the other.
 */
function notAfter(today: IsoDate, message: string) {
  return z.string().refine((day) => day <= today, message);
}

/**
 * The id of the check being written against.
 *
 * An id that is not even shaped like one gets the same answer as a well formed
 * id nobody has used, because to the person filling in the form they are the
 * same problem. It has to be refused here: the id column is uuid, and the
 * database raises on text that is not one rather than reporting that nothing
 * matched.
 */
function checkId() {
  return z.string().regex(uuidPattern, noSuchCheck.message);
}

const newCheckSchema = z
  .object({
    name: requiredText('A check needs a name.'),
    area: requiredText('A check needs an area.'),
    protects: requiredText('Say what the check is there to stop.'),
    howToTellArmed: requiredText(
      'Say how you can tell the check is switched on.',
    ),
  })
  .brand<'NewCheck'>();

function newTestRunSchema(today: IsoDate) {
  return z
    .object({
      checkId: checkId(),
      runOn: notAfter(today, 'A run cannot be dated after today.'),
      planted: requiredText('Say what was planted.'),
      expected: requiredText('Say what the check was expected to do.'),
      outcome: z.enum(testRunOutcomes),
      note: optionalNote,
    })
    .brand<'NewTestRun'>();
}

function newArmingObservationSchema(today: IsoDate) {
  return z
    .object({
      checkId: checkId(),
      observedOn: notAfter(
        today,
        'An observation cannot be dated after today.',
      ),
      armed: z.boolean(),
      note: optionalNote,
    })
    .brand<'NewArmingObservation'>();
}

/** A check that may be written. */
export type NewCheck = z.output<typeof newCheckSchema>;

/** A test run that may be written. */
export type NewTestRun = z.output<ReturnType<typeof newTestRunSchema>>;

/** An arming observation that may be written. */
export type NewArmingObservation = z.output<
  ReturnType<typeof newArmingObservationSchema>
>;

/**
 * Every issue zod found, in the order the fields are declared above, which is
 * the order a form lays them out in.
 */
function issuesFrom(error: z.ZodError): RecordIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

function parseWith<Value>(
  result: z.ZodSafeParseResult<Value>,
): ParseResult<Value> {
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, errors: issuesFrom(result.error) };
}

/** A new check, or every rule it breaks. */
export function parseNewCheck(
  input: z.input<typeof newCheckSchema>,
): ParseResult<NewCheck> {
  return parseWith(newCheckSchema.safeParse(input));
}

/** A new test run, or every rule it breaks, judged as of today. */
export function parseNewTestRun(
  input: z.input<ReturnType<typeof newTestRunSchema>>,
  today: IsoDate,
): ParseResult<NewTestRun> {
  return parseWith(newTestRunSchema(today).safeParse(input));
}

/** A new arming observation, or every rule it breaks, judged as of today. */
export function parseNewArmingObservation(
  input: z.input<ReturnType<typeof newArmingObservationSchema>>,
  today: IsoDate,
): ParseResult<NewArmingObservation> {
  return parseWith(newArmingObservationSchema(today).safeParse(input));
}
