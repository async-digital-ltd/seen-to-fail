import { z } from 'zod';

import { problemsFrom } from './report.ts';
import type { ReplayResult } from './report.ts';

/**
 * The plant declaration, read for the things canfail does not read.
 *
 * `canfail.json` is canfail's own format, ruled on #66: this project defines no
 * format of its own, because that config already carries the command, the file,
 * the anchor, the replacement and the expected failure, and a parallel format
 * would mean maintaining a translation into it for no property anybody can
 * name.
 *
 * What it does not carry is a check's address in this ledger, and it cannot: a
 * report says only what the check is called. #71 ruled that a check is
 * addressed by its ledger id and by nothing else, never resolved by its name,
 * so the two have to be tied together somewhere. They are tied together here,
 * in the same file and in the same object as the plant, under keys canfail
 * ignores. Measured against canfail 0.2.1: `run_check` reads `name`, `run`,
 * `breaks`, `timeout` and `evidence` from a check and nothing else, so an
 * unknown key beside them changes nothing about what it does.
 *
 * Beside the plant rather than in a table at the top of the file, because the
 * reason #66 gave for keeping the dependency list in this file is that a
 * check's plant and the things that void its proof should be read and edited
 * together. An address is one of those things, and #68's dependency list is
 * keyed by the same id, so it belongs in the same object.
 */

/**
 * A check in the configuration, read for this ledger's two keys.
 *
 * The one schema here that is deliberately NOT strict, and the exception is
 * worth saying out loud because strictness is the rule everywhere else. This
 * object is canfail's, and every key it owns would be an unknown key to this
 * reader. Refusing them would mean this file could only read a config canfail
 * cannot run.
 */
const plantedCheckSchema = z.object({
  /**
   * Required here, although canfail does not require it.
   *
   * canfail labels an unnamed check with the text of its command instead, so
   * the key a report would arrive under would depend on a rule inside somebody
   * else's program. Reproducing that rule here would be a second copy of it,
   * free to disagree with the first after an upgrade. Requiring the name is a
   * rule this repository puts on its own file, and reading the file checks it.
   */
  name: z
    .string()
    .trim()
    .min(1, 'Every check in the plant declaration needs a name.'),
  checkId: z
    .string()
    .trim()
    .min(
      1,
      'Every check in the plant declaration needs a checkId, which is its id in the ledger.',
    ),
  expected: z
    .string()
    .trim()
    .min(
      1,
      'Every check in the plant declaration needs an expected, which is what the check is expected to do about a plant.',
    ),
  /**
   * Read for the names, because a name is what a report files each outcome
   * under, and a report is held to these one for one (#128). Required for the
   * reason the check's own name is: the name a report would carry for an
   * unnamed break is a rule inside canfail, and a copy of that rule here would
   * be free to disagree with it after an upgrade.
   *
   * Read too for the three keys that say whether the plant can show anything
   * at all (#294): `file`, `replace` and `with`, to refuse a plant that
   * changes nothing, and `expect`, to refuse a failure pattern any failure
   * would match. Those are refused by name in `soundnessProblems`, not here,
   * so that each refusal names the plant it is about. `replace` and `with`
   * stay optional here, because whether a break can be applied without them
   * is canfail's rule, not this reader's.
   */
  breaks: z.array(
    z.object({
      name: z
        .string()
        .trim()
        .min(
          1,
          'Every break in the plant declaration needs a name, which is what a report files its outcome under.',
        ),
      file: z.string().optional(),
      replace: z.string().optional(),
      with: z.string().optional(),
      expect: z.string().optional(),
    }),
  ),
});

/** One declared break, as this reader reads it. */
type DeclaredBreak = z.output<typeof plantedCheckSchema>['breaks'][number];

/**
 * The `expect` patterns refused because any failure at all would match them,
 * compared after trimming and ignoring case.
 *
 * Deliberately short (#294). The ledger cannot judge whether a pattern is good
 * in general; it can only refuse the few that plainly say nothing. A pattern
 * here would score a run that failed for any reason, such as a missing
 * database or a typo in the command, as a catch.
 */
const catchAllExpects: readonly string[] = ['', '.*', 'error', 'fail'];

/**
 * How comments are written in a file, by its extension, for the one purpose
 * of telling a plant that changes only comments from one that changes code.
 *
 * Deliberately modest rather than a parser for each language. A line comment
 * counts only at the start of a line or after whitespace, so the `//` in a
 * URL and the `#` in a shell `$#` are left alone; the cost is that a comment
 * written straight after code with no space between is read as code, which
 * can only let a plant through, never refuse a sound one. A file whose type
 * is not listed is compared for whitespace alone.
 */
const commentSyntax: Readonly<
  Record<
    string,
    { readonly line?: string; readonly block?: readonly [string, string] }
  >
> = {
  ts: { line: '//', block: ['/*', '*/'] },
  tsx: { line: '//', block: ['/*', '*/'] },
  js: { line: '//', block: ['/*', '*/'] },
  jsx: { line: '//', block: ['/*', '*/'] },
  mjs: { line: '//', block: ['/*', '*/'] },
  cjs: { line: '//', block: ['/*', '*/'] },
  css: { block: ['/*', '*/'] },
  graphql: { line: '#' },
  sh: { line: '#' },
  bash: { line: '#' },
  yml: { line: '#' },
  yaml: { line: '#' },
  toml: { line: '#' },
  py: { line: '#' },
  sql: { line: '--', block: ['/*', '*/'] },
  html: { block: ['<!--', '-->'] },
  md: { block: ['<!--', '-->'] },
  svg: { block: ['<!--', '-->'] },
  xml: { block: ['<!--', '-->'] },
};

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/-]/g, '\\$&');
}

/**
 * The text with its comments and all of its whitespace taken out, so two
 * texts that differ only in those read the same.
 *
 * All whitespace rather than runs of it, because a plant that only adds a
 * space around an operator changes nothing either. That also refuses a plant
 * whose only change is a space inside a string or the indent of a YAML line,
 * which can change behaviour; such a plant can always be written to change
 * something else instead, and the ticket asks for whitespace to be refused.
 */
function withoutCommentsOrWhitespace(text: string, file: string): string {
  const extension = /\.([^./]+)$/.exec(file)?.[1]?.toLowerCase() ?? '';
  const syntax = commentSyntax[extension];
  let stripped = text;
  if (syntax?.block !== undefined) {
    const [open, close] = syntax.block;
    stripped = stripped.replace(
      new RegExp(`${escaped(open)}[\\s\\S]*?${escaped(close)}`, 'g'),
      '',
    );
  }
  if (syntax?.line !== undefined) {
    stripped = stripped.replace(
      new RegExp(`(^|\\s)${escaped(syntax.line)}[^\\n]*`, 'gm'),
      '$1',
    );
  }
  return stripped.replace(/\s+/g, '');
}

/**
 * Every reason this break cannot show whether its check works, each naming
 * the plant (#294).
 *
 * A plant that changes nothing is recorded as a miss when the check stays
 * green, which shows a sound check as Broken. An `expect` that any failure
 * matches scores a run that failed for the wrong reason as a catch, which
 * shows a check as Proven that nothing proved. Both are refused when the
 * declaration is read, before any replay runs.
 *
 * A plant that applies, changes behaviour, and that no check sees is not
 * refused: canfail scores it `blind`, and the ledger cannot tell that from a
 * weak check.
 */
function soundnessProblems(
  checkName: string,
  declared: DeclaredBreak,
): string[] {
  const plant = `The break ${declared.name} of the check ${checkName}`;
  const problems: string[] = [];

  if (declared.replace !== undefined && declared.with !== undefined) {
    if (declared.replace === declared.with) {
      problems.push(
        `${plant} replaces its text with the same text, so the plant changes nothing and cannot show whether the check works.`,
      );
    } else if (
      withoutCommentsOrWhitespace(declared.replace, declared.file ?? '') ===
      withoutCommentsOrWhitespace(declared.with, declared.file ?? '')
    ) {
      problems.push(
        `${plant} changes only whitespace or comments, so the plant changes nothing and cannot show whether the check works.`,
      );
    }
  }

  if (declared.expect === undefined) {
    problems.push(
      `${plant} declares no expect, so any failure at all would be scored as a catch.`,
    );
  } else if (catchAllExpects.includes(declared.expect.trim().toLowerCase())) {
    problems.push(
      `${plant} expects ${JSON.stringify(declared.expect)}, which any failure at all would match, so it would score a failure for the wrong reason as a catch.`,
    );
  }

  return problems;
}

const declarationSchema = z.object({
  checks: z.array(plantedCheckSchema),
});

/** What this ledger needs to know about one declared check. */
export interface PlantedCheck {
  /** The check's id in the ledger, which is its address. */
  readonly checkId: string;
  /** What the check is expected to do about a plant, recorded on every run. */
  readonly expected: string;
  /**
   * The names of the check's declared breaks, in the order declared. A report
   * about this check has to carry exactly one outcome for each of them.
   */
  readonly breaks: readonly string[];
}

/**
 * Every declared check, by the name a report will call it.
 *
 * A map rather than a list, because looking one up by the name in a report is
 * the only thing anybody does with it.
 */
export type PlantedChecks = ReadonlyMap<string, PlantedCheck>;

/** Every name that appears more than once in the list, each named once. */
export function repeated(names: readonly string[]): string[] {
  return [...new Set(names.filter((name, at) => names.indexOf(name) !== at))];
}

/**
 * The checks a report can be read against, or every rule the declaration broke.
 *
 * Two checks sharing a name is refused rather than resolved, because a report
 * naming that check could then mean either of them, and picking one would post
 * a run against a check nobody chose. It is the same objection #71 made to
 * addressing a check by its name at all, arriving one level down.
 */
export function parsePlantedChecks(
  input: unknown,
): ReplayResult<PlantedChecks> {
  const result = declarationSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, problems: problemsFrom(result.error) };
  }

  const checks = new Map<string, PlantedCheck>();
  const problems: string[] = [];

  for (const check of result.data.checks) {
    if (checks.has(check.name)) {
      problems.push(
        `Two checks in the plant declaration are both named ${check.name}, so a report naming it could mean either.`,
      );
      continue;
    }
    const breaks = check.breaks.map((declared) => declared.name);
    // The same objection one level down: an outcome filed under a name two
    // breaks share could be about either plant.
    for (const name of repeated(breaks)) {
      problems.push(
        `Two breaks of the check ${check.name} are both named ${name}, so an outcome filed under it could mean either.`,
      );
    }
    for (const declared of check.breaks) {
      problems.push(...soundnessProblems(check.name, declared));
    }
    checks.set(check.name, {
      checkId: check.checkId,
      expected: check.expected,
      breaks,
    });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }
  if (checks.size === 0) {
    return {
      ok: false,
      problems: ['The plant declaration declares no checks.'],
    };
  }
  return { ok: true, value: checks };
}
