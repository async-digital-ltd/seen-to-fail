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
});

const declarationSchema = z.object({
  checks: z.array(plantedCheckSchema),
});

/** What this ledger needs to know about one declared check. */
export interface PlantedCheck {
  /** The check's id in the ledger, which is its address. */
  readonly checkId: string;
  /** What the check is expected to do about a plant, recorded on every run. */
  readonly expected: string;
}

/**
 * Every declared check, by the name a report will call it.
 *
 * A map rather than a list, because looking one up by the name in a report is
 * the only thing anybody does with it.
 */
export type PlantedChecks = ReadonlyMap<string, PlantedCheck>;

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
    checks.set(check.name, {
      checkId: check.checkId,
      expected: check.expected,
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
