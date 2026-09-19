import { z } from 'zod';

/**
 * What a replay tool said, before any of it is believed.
 *
 * This is the boundary between somebody else's program and this ledger. The
 * tool is canfail 0.2.1, pinned on #66, and it hands over a JSON document on
 * standard output. Everything downstream of this file works on a shape that has
 * already been read; nothing downstream sees a string the tool printed.
 *
 * The schema is strict, which is the house rule for every record in this
 * repository and is worth more here than anywhere else. A pinned tool that grew
 * a key is a pinned tool that has changed, and the mapping in adapt.ts was
 * written against the version without it. Refusing the report is how that shows
 * up as a refusal naming the version rather than as records quietly missing
 * whatever the new key carried.
 */

/**
 * The whole vocabulary canfail 0.2.1 can emit, pinned on #66.
 *
 * Declared here as text rather than as a schema so that a fifth verdict is a
 * refusal that can say which verdict it did not know. A `z.enum` at the parse
 * boundary would refuse it too, but as a malformed report, which reads as the
 * tool being broken rather than as this mapping being out of date. They call
 * for different actions and should not arrive in the same shape.
 */
export const canfailVerdicts = [
  'catches',
  'blind',
  'wrong-failure',
  'look',
] as const;

/** One of the four verdicts canfail 0.2.1 emits. */
export type CanfailVerdict = (typeof canfailVerdicts)[number];

/**
 * One declared break, and what the check did about it.
 *
 * `check` is the check's name in the configuration rather than its address in
 * this ledger. canfail has no idea this ledger exists and the name is all it
 * carries, which is the whole reason plants.ts has a mapping in it (#71).
 *
 * `verdict` is read as text on purpose. See the note on the vocabulary above.
 */
const outcomeSchema = z.strictObject({
  check: z.string(),
  break_name: z.string(),
  verdict: z.string(),
  detail: z.string(),
});

/** One line of a replay tool's report. */
export type CanfailOutcome = z.output<typeof outcomeSchema>;

/**
 * The tallies canfail prints beside its outcomes.
 *
 * Read and held rather than checked against the outcomes below them. They are
 * that program's own arithmetic over its own list, so a guard comparing them
 * could only ever fire on a bug in a pinned dependency, and a guard that cannot
 * fire against anything real is the thing this repository exists to object to.
 * What is worth refusing is a report with no outcomes at all, and that is done
 * in adapt.ts where the refusal can say what it means.
 */
const reportSchema = z.strictObject({
  breaks: z.number().int().nonnegative(),
  catches: z.number().int().nonnegative(),
  findings: z.number().int().nonnegative(),
  look: z.number().int().nonnegative(),
  outcomes: z.array(outcomeSchema),
});

/** A replay tool's whole report. */
export type CanfailReport = z.output<typeof reportSchema>;

/** A parsed value, or every reason it was refused. */
export type ReplayResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * Every rule a value broke, as sentences.
 *
 * Sentences rather than the field-and-message pairs the ledger's own reader
 * produces, because nothing here is a form. These are read by a person looking
 * at a failed job's log, and the field a key sits under is not what they need
 * to know.
 */
export function problemsFrom(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return path === '' ? issue.message : `${path}: ${issue.message}`;
  });
}

/**
 * A replay tool's report, or every rule it broke.
 *
 * Takes what JSON.parse produced rather than the text, so that a document which
 * is not JSON at all is refused by the caller that read it, with the path it
 * read. That refusal names a file; this one names a shape.
 */
export function parseCanfailReport(
  input: unknown,
): ReplayResult<CanfailReport> {
  const result = reportSchema.safeParse(input);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, problems: problemsFrom(result.error) };
}
