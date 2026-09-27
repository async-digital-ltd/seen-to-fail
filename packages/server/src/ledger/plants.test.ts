import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseDeclaredChecks, parsePlantedChecks } from '@seen-to-fail/replay';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { loadLedger } from './load.ts';
import { ledgerDirectory, repositoryRoot } from './location.ts';

/**
 * This repository's own plant declaration, held to the ledger it addresses and
 * to the tree it breaks.
 *
 * canfail checks each of these at the moment it runs and answers `look` for the
 * one it cannot apply: an anchor matching nowhere is a break that never
 * happened, and one matching twice edits a line nobody meant. The adapter
 * records a `look` as a run that settled nothing, the status rules skip it, and
 * the proof it was meant to refresh ages out on the backstop with a row saying
 * why. That is the honest outcome, and it is also a Monday away. A refactor
 * that moves an anchor, renames a check, or drops a file a plant edits should
 * go red in the pull request that does it, which is what these are for.
 *
 * Read from the real file rather than a fixture, because the file is the thing
 * under test. The replay package's own tests cover what its readers refuse;
 * these cover whether what is committed here is something they accept and
 * canfail can apply.
 */

/**
 * The keys canfail reads from a check and a break, which the adapter's readers
 * deliberately leave alone. Not strict: canfail's own keys are its business,
 * and this test is about the ones a plant cannot do without.
 */
const breakSchema = z.object({
  name: z.string().trim().min(1),
  file: z.string().trim().min(1),
  replace: z.string().min(1),
  with: z.string(),
  expect: z.string().trim().min(1),
});

const checkSchema = z.object({
  name: z.string().trim().min(1),
  checkId: z.string().trim().min(1),
  run: z.string().trim().min(1),
  evidence: z.object({ expect: z.string().trim().min(1) }),
  dependsOn: z.array(z.string()).optional(),
  breaks: z.array(breakSchema).min(1),
});

const declarationSchema = z.object({ checks: z.array(checkSchema).min(1) });

type Declaration = z.output<typeof declarationSchema>;

async function declarationInput(): Promise<unknown> {
  return JSON.parse(
    await readFile(join(repositoryRoot, 'canfail.json'), 'utf8'),
  ) as unknown;
}

async function declaration(): Promise<Declaration> {
  return declarationSchema.parse(await declarationInput());
}

/** How many times the text holds the anchor, which canfail needs to be one. */
function occurrences(text: string, anchor: string): number {
  return text.split(anchor).length - 1;
}

describe('the plant declaration this repository commits', () => {
  it('reads through both of the adapter’s readers', async () => {
    const input = await declarationInput();
    expect(parseDeclaredChecks(input).ok).toBe(true);
    expect(parsePlantedChecks(input).ok).toBe(true);
  });

  it('addresses only checks the ledger holds', async () => {
    const ledger = await loadLedger({ directory: ledgerDirectory });
    expect(ledger.ok).toBe(true);
    if (!ledger.ok) return;
    const ids = new Set(ledger.contents.checks.map((entry) => entry.record.id));

    for (const check of (await declaration()).checks) {
      expect(ids, `${check.checkId} is not a check in the ledger`).toContain(
        check.checkId,
      );
    }
  });

  /**
   * Every break, not most of them. A `pnpm ledger:build` that is refused
   * prints why and exits 1, and so does one whose database is not there; the
   * `expect` on a break is what tells the first from the second, and a break
   * without one would score any failure at all as a catch.
   */
  it('names a file that exists, anchored exactly once, for every break', async () => {
    for (const check of (await declaration()).checks) {
      for (const planted of check.breaks) {
        const path = join(repositoryRoot, planted.file);
        expect(existsSync(path), `${planted.file} does not exist`).toBe(true);
        const text = await readFile(path, 'utf8');
        expect(
          occurrences(text, planted.replace),
          `the anchor for "${planted.name}" in ${planted.file}`,
        ).toBe(1);
        expect(planted.with).not.toBe(planted.replace);
      }
    }
  });

  /**
   * A dependency that names nothing in the tree can never match a changed
   * path, so the check it sits on waits for the age floor without anybody
   * being told. The replay package's README says a path can be checked with
   * `ls`; this is that, run on every push.
   */
  it('depends only on paths that exist in the tree', async () => {
    for (const check of (await declaration()).checks) {
      for (const dependency of check.dependsOn ?? []) {
        expect(
          existsSync(join(repositoryRoot, dependency)),
          `${check.checkId} depends on ${dependency}, which is not in the tree`,
        ).toBe(true);
      }
    }
  });
});
