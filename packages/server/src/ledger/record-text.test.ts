import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fixtureContents, fixtureLedgerPath } from '../testing/ledger.ts';
import { loadLedger } from './load.ts';
import { ledgerDirectory, ledgerPath, repositoryRoot } from './location.ts';
import { recordHtml } from './page.ts';
import {
  entryProblem,
  recordPieces,
  RecordTextError,
  welshRefusals,
} from './record-text.ts';
import type { TextPiece } from './record-text.ts';
import { recordWelsh } from './record-welsh.ts';
import { englishDateWordsOutsideCode } from './verify.ts';

/**
 * A record's text in Welsh (#284): the table keyed on the exact English, the
 * code its entries mark, and the refusal that keeps both pages unpublished
 * until every text the page shows has its Welsh.
 */

/** Pieces written the way the tests below read them: code in square brackets. */
function shown(pieces: readonly TextPiece[]): string {
  return pieces
    .map((piece) => (piece.code ? `[${piece.text}]` : piece.text))
    .join('');
}

describe('an entry read against its English', () => {
  it('marks on the English page the code its Welsh marks', () => {
    const english = 'STATUSES loses its as const, so Status widens to string.';
    const welsh = new Map([
      [
        english,
        'Mae `STATUSES` yn colli ei `as const`, felly mae `Status` yn lledu i `string`.',
      ],
    ]);

    expect(shown(recordPieces(english, 'en', welsh))).toBe(
      '[STATUSES] loses its [as const], so [Status] widens to [string].',
    );
    expect(shown(recordPieces(english, 'cy', welsh))).toBe(
      'Mae [STATUSES] yn colli ei [as const], felly mae [Status] yn lledu i [string].',
    );
  });

  /**
   * Code is found only where it is a word of its own: `if` is the shell
   * keyword in "an if and", and not the middle of "different".
   */
  it('finds code only where it stands as a word of its own', () => {
    const english = 'A different test, rewritten as an if and seen to deny.';
    const welsh = new Map([[english, 'Prawf gwahanol, fel `if`.']]);

    expect(shown(recordPieces(english, 'en', welsh))).toBe(
      'A different test, rewritten as an [if] and seen to deny.',
    );
  });

  /** A branch is claimed whole before its prefix can be found inside it. */
  it('claims the longest code first, so a prefix is not found inside it', () => {
    const english =
      'Planted on the ci-control lane, on branch ci-control/63-plant at d6c0575.';
    const welsh = new Map([
      [
        english,
        'Plannwyd ar lôn `ci-control`, ar y gangen `ci-control/63-plant` ar `d6c0575`.',
      ],
    ]);

    expect(shown(recordPieces(english, 'en', welsh))).toBe(
      'Planted on the [ci-control] lane, on branch [ci-control/63-plant] at [d6c0575].',
    );
  });

  /**
   * A record that marks its own code with backticks keeps it as code, with
   * the backticks taken off, and its Welsh has to mark the same.
   */
  it('reads a record’s own backticks as code', () => {
    const english = 'And a `uses:` in a workflow, which actionlint accepts.';
    const welsh =
      'A `uses:` mewn llif gwaith, y mae `actionlint` yn ei dderbyn.';

    expect(
      shown(recordPieces(english, 'en', new Map([[english, welsh]]))),
    ).toBe('And a [uses:] in a workflow, which [actionlint] accepts.');
    expect(entryProblem(english, 'A uses: mewn llif gwaith.')).toBe(
      'the English marks `uses:` as code, and the Welsh does not',
    );
  });

  /**
   * Each refusal names what it refused. A mistyped identifier, code the
   * English prints a different number of times, a backtick with no partner,
   * an empty span and an empty entry are each refused, and the sound entry
   * beside them is not.
   */
  it('refuses Welsh whose code is not printed in the English as it is', () => {
    const english =
      'record-run.yml reads inputs.check_id, twice: inputs.check_id.';

    expect(
      entryProblem(
        english,
        '`record-run.yml`, `inputs.check_id` ddwywaith: `inputs.check_id`.',
      ),
    ).toBeNull();
    expect(
      entryProblem(
        english,
        '`record-run.yml`, `inputs.check_id` a `inputs.checkid` ddwywaith: `inputs.check_id`.',
      ),
    ).toBe(
      'the Welsh marks `inputs.checkid` as code once, and the English prints it as a word of its own 0 times',
    );
    expect(entryProblem(english, '`record-run.yml`, `inputs.check_id`.')).toBe(
      'the Welsh marks `inputs.check_id` as code once, and the English prints it as a word of its own 2 times',
    );
    expect(entryProblem(english, '`record-run.yml`, `inputs.check_id.')).toBe(
      'the Welsh has a backtick with no partner',
    );
    expect(entryProblem(english, '`record-run.yml`, ``.')).toBe(
      'the Welsh has an empty code span',
    );
    expect(entryProblem(english, ' ')).toBe('the Welsh is empty');
  });

  it('prints the English as written without an entry, and no Welsh at all', () => {
    const english = 'A type error, in `types.ts`.';

    expect(shown(recordPieces(english, 'en', new Map()))).toBe(
      'A type error, in [types.ts].',
    );
    expect(() => recordPieces(english, 'cy', new Map())).toThrow(
      RecordTextError,
    );
  });
});

describe('the refusal the build runs before it publishes', () => {
  /**
   * Seen to fail and to pass on the fixture ledger: one text left out names
   * that text and its record, quoted so it can be copied, and the full table
   * leaves nothing to refuse.
   */
  it('names every shown text with no Welsh, once, with its record', () => {
    const contents = fixtureContents();
    const table = new Map([
      ['A check with a catch behind it', 'Gwiriad â daliad y tu ôl iddo'],
      ['CI', 'CI'],
      [
        'A check nobody has planted anything for',
        'Gwiriad nad oes neb wedi plannu dim ar ei gyfer',
      ],
      ['Review', 'Adolygu'],
      ['A defect reaching main.', 'Nam yn cyrraedd `main`.'],
      [
        'The step appears in the run list.',
        'Mae’r cam yn ymddangos yn y rhestr rediadau.',
      ],
      ['A type error.', 'Gwall math.'],
    ]);

    expect(welshRefusals(contents, fixtureLedgerPath, table)).toStrictEqual([
      'ledger/runs/2026-09-10-first-check-abcdef123456.json, what was expected, has no Welsh: "The type check fails."',
      'Add the Welsh to packages/server/src/ledger/record-welsh.ts, keyed on each English text exactly as quoted above, with backticks around every identifier and every piece of tool output. docs/publishing.md says how.',
    ]);

    table.set('The type check fails.', 'Mae’r gwiriad mathau yn methu.');
    expect(welshRefusals(contents, fixtureLedgerPath, table)).toStrictEqual([]);
  });

  it('names a text many records share once, with how many others hold it', () => {
    const contents = fixtureContents();
    const [run] = contents.runs;
    if (run === undefined) {
      throw new Error('The fixture has no run.');
    }
    const shared = {
      ...contents,
      runs: [
        run,
        { ...run, file: 'runs/two.json' },
        { ...run, file: 'runs/three.json' },
      ],
    };
    const refusals = welshRefusals(shared, fixtureLedgerPath, new Map());

    expect(refusals).toContain(
      'ledger/runs/2026-09-10-first-check-abcdef123456.json, what was planted, and 2 other record texts like it, has no Welsh: "A type error."',
    );
  });
});

/**
 * The table this repository commits, held to the ledger it translates and to
 * the declaration the replay records from. Read from the real files, because
 * the files are what is under test.
 */
describe('the Welsh this repository commits', () => {
  it('has printable Welsh for every text the committed ledger shows', async () => {
    const loaded = await loadLedger({ directory: ledgerDirectory });
    if (!loaded.ok) {
      throw new Error('The committed ledger does not load.');
    }

    expect(
      welshRefusals(loaded.contents, ledgerPath, recordWelsh),
    ).toStrictEqual([]);
  });

  /**
   * A replay records each break's name as what was planted and its check's
   * expected outcome as what was expected. With an entry for each before the
   * replay runs, a replay of today's declaration records nothing the table
   * lacks, so it cannot stop the page being published.
   */
  it('has Welsh for every break canfail.json declares and every outcome it expects', async () => {
    const declaration = JSON.parse(
      await readFile(join(repositoryRoot, 'canfail.json'), 'utf8'),
    ) as {
      checks: { expected: string; breaks: { name: string }[] }[];
    };
    const texts = declaration.checks.flatMap((check) => [
      check.expected,
      ...check.breaks.map((planted) => planted.name),
    ]);

    expect(texts.length).toBeGreaterThan(0);
    expect(texts.filter((text) => !recordWelsh.has(text))).toStrictEqual([]);
  });

  it('holds no entry whose Welsh cannot be printed beside its English', () => {
    const problems = [...recordWelsh]
      .map(([english, welsh]) => [english, entryProblem(english, welsh)])
      .filter(([, problem]) => problem !== null);

    expect(recordWelsh.size).toBeGreaterThan(0);
    expect(problems).toStrictEqual([]);
  });

  /**
   * The build refuses a Welsh page naming a month or a day in English outside
   * code (verify.ts). This holds every entry to the same rule before any page
   * is built, read as the Welsh page prints it, so a date copied in English
   * fails here, by the entry, as well as at the build. The detector is shown
   * to find a month first, on the English of an entry that has one.
   */
  it('holds no entry whose Welsh names a month or a day in English outside code', () => {
    const dated =
      'Read on 4 October 2026 from run 36991152739 of the CI workflow on main at a7cd00d, which ran on 2 October 2026: the "Lint the workflows" step ran and the run concluded success.';
    expect(
      englishDateWordsOutsideCode(recordHtml(dated, 'en', recordWelsh)),
    ).toStrictEqual(['October', 'October']);

    const english = [...recordWelsh.keys()]
      .map((text) => ({
        text,
        found: englishDateWordsOutsideCode(recordHtml(text, 'cy', recordWelsh)),
      }))
      .filter(({ found }) => found.length > 0);
    expect(english).toStrictEqual([]);
  });
});
