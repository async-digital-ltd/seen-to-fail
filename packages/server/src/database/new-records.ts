import { z } from 'zod';

import { uuidPattern } from './checks.ts';
import { testRunOutcomes } from './rows.ts';
import type { IsoDate } from './rows.ts';

/**
 * What a new check, run or observation has to be before it is written, and the
 * only way to get one.
 *
 * The rules here are the ones a reader of the input can apply without asking
 * the database: a required field is not blank, text is not too long and holds
 * nothing PostgreSQL cannot store, a day is not after today, and a check id is
 * at least shaped like one. Each schema ends in a brand, and the writes take the
 * branded type, so a value that has not been through one of the parse functions
 * below cannot reach an insert without a type error on the way.
 *
 * The aim is that nothing these rules accept is refused by PostgreSQL for being
 * malformed. Every such refusal found so far has a rule of its own below, and a
 * test that sends the value and counts the statements that reach the database.
 *
 * Three rules cannot be applied here, because only the database knows the
 * answer: whether a name is already in use, whether a check exists under an id,
 * and whether a day is after the database's own today, which is the last word
 * on the rule this file checks against the request's. The writes leave all
 * three to the constraints that already enforce them and turn each refusal into
 * the same kind of issue, using the issues defined below, so a caller cannot
 * tell which side of the insert a rule was applied on and does not need to.
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

/** What is said about a run dated after today, by either side of the insert. */
export const runDatedAfterToday: RecordIssue = {
  path: 'runOn',
  message: 'A run cannot be dated after today.',
};

/** What is said about an observation dated after today, by either side. */
export const observationDatedAfterToday: RecordIssue = {
  path: 'observedOn',
  message: 'An observation cannot be dated after today.',
};

/**
 * The longest a name or an area may be, in characters.
 *
 * A name and an area are labels, read in a row of a list, and two hundred is
 * several times the longest one a reader would want to scan. The name also has a
 * hard ceiling beneath it: it is held unique by a btree index, and PostgreSQL
 * refuses a value whose index entry passes 2704 bytes. A character here is a
 * UTF-16 code unit, which is at most three bytes of UTF-8, so the longest name
 * this allows is 600 bytes and cannot reach that ceiling however it is written.
 */
export const MAX_LABEL_LENGTH = 200;

/**
 * The longest any other text may be, in characters.
 *
 * Several paragraphs, which is more than a description of a check, a planted
 * defect or a note needs. Nothing indexes these columns, so PostgreSQL's own
 * limit is a gigabyte a field, and the limit is here so that nothing a request
 * can carry comes near it.
 */
export const MAX_TEXT_LENGTH = 10_000;

/**
 * An unpaired UTF-16 surrogate: half of a character, which is not text.
 *
 * JSON can carry one and a JavaScript string can hold one, but UTF-8 cannot, so
 * the driver swaps it for U+FFFD on the way to PostgreSQL. The database accepts
 * the swap, which makes this the one value here that is not refused but stored
 * as something other than what was sent. With the `u` flag a pair that makes up
 * a real character is one code point and does not match.
 */
const unpairedSurrogate = /\p{Surrogate}/u;

/**
 * Text that PostgreSQL can store exactly as it was sent.
 *
 * A NUL character is refused by PostgreSQL outright, as an invalid byte
 * sequence, and an unpaired surrogate is quietly changed. Neither can be typed
 * into a form, so either one arriving is a paste or a client bug, and neither
 * should reach the database.
 */
function storable(text: string): boolean {
  return !text.includes('\u0000') && !unpairedSurrogate.test(text);
}

/** What is said about text that cannot be stored as sent. */
const unstorableMessage = 'This contains a character that cannot be saved.';

/** What is said about text longer than its field allows. */
function tooLongMessage(maxLength: number): string {
  return `This can be at most ${String(maxLength)} characters.`;
}

/**
 * Text a person has to fill in.
 *
 * Trimmed before it is measured and stored trimmed, so a field of nothing but
 * spaces is as blank here as it is to every reader, and two names that differ
 * only in a trailing space are the same name when the database compares them.
 *
 * Each rule stops the ones after it, so a field breaking several is reported
 * once, with the first it breaks. A form shows one message beside a field, and
 * counting the fields at fault should count fields rather than rules.
 */
function requiredText(blankMessage: string, maxLength: number) {
  return z
    .string()
    .trim()
    .min(1, { error: blankMessage, abort: true })
    .max(maxLength, { error: tooLongMessage(maxLength), abort: true })
    .refine(storable, { error: unstorableMessage, abort: true });
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
  .max(MAX_TEXT_LENGTH, {
    error: tooLongMessage(MAX_TEXT_LENGTH),
    abort: true,
  })
  .refine(storable, { error: unstorableMessage, abort: true })
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
    name: requiredText('A check needs a name.', MAX_LABEL_LENGTH),
    area: requiredText('A check needs an area.', MAX_LABEL_LENGTH),
    protects: requiredText(
      'Say what the check is there to stop.',
      MAX_TEXT_LENGTH,
    ),
    howToTellArmed: requiredText(
      'Say how you can tell the check is switched on.',
      MAX_TEXT_LENGTH,
    ),
  })
  .brand<'NewCheck'>();

function newTestRunSchema(today: IsoDate) {
  return z
    .object({
      checkId: checkId(),
      runOn: notAfter(today, runDatedAfterToday.message),
      planted: requiredText('Say what was planted.', MAX_TEXT_LENGTH),
      expected: requiredText(
        'Say what the check was expected to do.',
        MAX_TEXT_LENGTH,
      ),
      outcome: z.enum(testRunOutcomes),
      note: optionalNote,
    })
    .brand<'NewTestRun'>();
}

function newArmingObservationSchema(today: IsoDate) {
  return z
    .object({
      checkId: checkId(),
      observedOn: notAfter(today, observationDatedAfterToday.message),
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
