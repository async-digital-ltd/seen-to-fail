import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runsDirectory } from '../ledger/load.ts';
import { ledgerDirectory } from '../ledger/location.ts';
import { STALE_AFTER_DAYS } from '../staleness.ts';
import { countOf, flattened, readDoc } from './readme.ts';
import {
  markdownTable,
  readReplayRecord,
  replayTable,
  replayTotals,
  runsPerReplay,
  writtenDay,
  writtenOrdinal,
} from './replays.ts';
import type { LedgerRun, ReplayRecord } from './replays.ts';

/**
 * The generated replay counts, and the claims about replays that are still
 * typed by hand, held to `ledger/` and `canfail.json` (#243).
 *
 * The generated blocks themselves are held by the test in `readme.test.ts`
 * that holds every generated block. What is held here is what a replay cannot
 * move and a person writes: which run first replayed each check, the days the
 * section dates its history by, the day `ci-codegen-check` goes Stale, and the
 * shapes of the hand records `ledger/README.md` counts. Each of those changes
 * only when somebody declares a check or types a run in by hand, which is a
 * pull request a person writes anyway, so a test is the right guard for them
 * and a generator would be the wrong one.
 */

const actionsRun =
  'https://github.com/async-digital-ltd/seen-to-fail/actions/runs/';

function replay(checkId: string, runOn: string, run: number): LedgerRun {
  return {
    checkId,
    runOn,
    source: 'replay',
    sourceRunUrl: `${actionsRun}${String(run)}`,
  };
}

function hand(checkId: string, runOn: string): LedgerRun {
  return { checkId, runOn, source: 'hand', sourceRunUrl: null };
}

describe('the generated replay counts', () => {
  const record: ReplayRecord = {
    checks: ['a-check', 'b-check', 'c-check'],
    declared: new Map([
      ['a-check', 2],
      ['b-check', 1],
    ]),
    runs: [
      hand('a-check', '2026-09-18'),
      replay('a-check', '2026-09-19', 10),
      replay('a-check', '2026-09-19', 10),
      replay('a-check', '2026-09-26', 12),
      replay('a-check', '2026-09-26', 12),
      replay('b-check', '2026-09-26', 12),
      hand('c-check', '2026-10-05'),
      hand('c-check', '2026-10-05'),
    ],
  };

  it('writes a row per check, with its runs by source and its first and latest replay', () => {
    const table = replayTable(record);
    expect(table.startsWith('\n') && table.endsWith('\n')).toBe(true);
    const cells = table
      .trim()
      .split('\n')
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    expect(cells).toStrictEqual([
      [
        'Check',
        'Declared breaks',
        'Runs',
        'From a replay',
        'Typed in by hand',
        'First replayed',
        'Latest replay',
      ],
      cells[1],
      [
        '`a-check`',
        '2',
        '5',
        '4',
        '1 (18 September 2026)',
        '19 September 2026',
        '26 September 2026',
      ],
      [
        '`b-check`',
        '1',
        '1',
        '1',
        '0',
        '26 September 2026',
        '26 September 2026',
      ],
      [
        '`c-check`',
        'Not declared',
        '2',
        '0',
        '2 (5 October 2026, 5 October 2026)',
        'Never',
        'Never',
      ],
    ]);
  });

  it('totals the checks and the runs by where they came from', () => {
    expect(replayTotals(record)).toBe(
      '\nThree checks are on the page, two of them are declared for replay, and both have been replayed. All three have a run behind them. `ledger/runs/` holds eight runs: five came from two replays and three were typed in by hand. The latest replay among them ran on 26 September 2026.\n',
    );
  });

  it('says how many runs each replay wrote, saying a stretch of equal counts once', () => {
    const runs = [
      ...[1, 2, 3].flatMap((run) => [
        replay('a-check', '2026-09-19', run),
        replay('a-check', '2026-09-19', run),
      ]),
      replay('a-check', '2026-09-20', 4),
      ...[5, 6].flatMap((run) => [
        replay('a-check', '2026-09-21', run),
        replay('b-check', '2026-09-21', run),
        replay('a-check', '2026-09-21', run),
      ]),
      ...[7, 8, 9].map((run) => replay('a-check', '2026-09-22', run)),
    ];
    expect(runsPerReplay({ ...record, runs })).toBe(
      '\nUp to the replay of 22 September 2026, nine replays have written runs here: two for each of the first three, one for the fourth, three each for the fifth and sixth, and one each for the seventh to the ninth.\n',
    );
  });

  it('orders two replays on the same day by their run, not by the order of the files', () => {
    const runs = [
      replay('a-check', '2026-09-19', 200),
      replay('a-check', '2026-09-19', 30),
      replay('a-check', '2026-09-19', 30),
    ];
    expect(runsPerReplay({ ...record, runs })).toContain(
      'two for the first and one for the second.',
    );
  });

  it('refuses a replay record that names no run, rather than counting it as one of its own', () => {
    const runs: LedgerRun[] = [
      {
        checkId: 'a-check',
        runOn: '2026-09-19',
        source: 'replay',
        sourceRunUrl: null,
      },
    ];
    expect(() => runsPerReplay({ ...record, runs })).toThrow(
      'names no run that produced it',
    );
  });

  it('writes days, positions and tables the way the documentation does', () => {
    expect(writtenDay('2026-10-05')).toBe('5 October 2026');
    expect(() => writtenDay('2026-13-05')).toThrow();
    expect(
      [1, 11, 20, 21, 22, 23, 24, 111, 112].map(writtenOrdinal),
    ).toStrictEqual([
      'first',
      'eleventh',
      'twentieth',
      '21st',
      '22nd',
      '23rd',
      '24th',
      '111th',
      '112th',
    ]);
    expect(markdownTable(['A', 'Longer'], [['wide cell', 'x']])).toBe(
      [
        '| A         | Longer |',
        '| --------- | ------ |',
        '| wide cell | x      |',
      ].join('\n'),
    );
  });
});

/** The ledger as it stands. */
const ledger = readReplayRecord();

/** A day as the documentation writes it, read back as `YYYY-MM-DD`. */
function dayOf(written: string): string {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const parts = /^(\d{1,2}) (\w+) (\d{4})$/u.exec(written);
  const month = months.indexOf(parts?.[2] ?? '');
  if (parts === null || month === -1) {
    throw new Error(`"${written}" is not a day these tests can read.`);
  }
  return `${parts[3] ?? ''}-${String(month + 1).padStart(2, '0')}-${(parts[1] ?? '').padStart(2, '0')}`;
}

/** The Actions run id a replay record links to. */
function runId(run: LedgerRun): number {
  return Number(/(\d+)$/u.exec(run.sourceRunUrl ?? '')?.[1] ?? NaN);
}

/** The run that first replayed a check: its earliest day, then its lowest run. */
function firstReplayOf(checkId: string): LedgerRun | undefined {
  return ledger.runs
    .filter((run) => run.checkId === checkId && run.source === 'replay')
    .sort((a, b) => a.runOn.localeCompare(b.runOn) || runId(a) - runId(b))
    .at(0);
}

/**
 * The one match of a pattern in some prose. A sentence reworded so the
 * pattern no longer finds it, or written twice, is refused, so a claim can
 * neither go unread nor be read off the wrong copy.
 */
function onlyMatch(prose: string, sentence: RegExp, where: string): string[] {
  const found = [...prose.matchAll(sentence)];
  const [only] = found;
  if (only === undefined || found.length > 1) {
    throw new Error(
      `${where} has ${String(found.length)} sentences matching ${String(sentence)}, and exactly one was expected.`,
    );
  }
  return only.slice(1);
}

describe('docs/automatic.md, where a person writes it', () => {
  const automatic = readDoc('automatic.md');
  const prose = flattened(automatic);
  const declared = [...ledger.declared.keys()];

  it('dates the first replays of the declared checks as the ledger does', () => {
    const [all, allBy, some, someBy] = onlyMatch(
      prose,
      /and all (\w+) had been replayed by (\d+ \w+ \d{4})\. (\w+) of them had first been replayed by (\d+ \w+ \d{4})\./gu,
      'docs/automatic.md',
    );
    const firstBy = (day: string): number =>
      declared.filter((checkId) => {
        const first = firstReplayOf(checkId);
        return first !== undefined && first.runOn <= day;
      }).length;

    expect(countOf(all ?? '')).toBe(declared.length);
    expect(firstBy(dayOf(allBy ?? ''))).toBe(declared.length);
    expect(firstBy(dayOf(someBy ?? ''))).toBe(countOf(some ?? ''));
  });

  /**
   * The hand-written table's rows, by the checks each names in its first
   * column, with the run each says first replayed them. Every declared check
   * is in exactly one row that says so, and every row that says so is right
   * about every check it names.
   */
  it('names, for every declared check, the run that first replayed it', () => {
    const rows = automatic
      .split('\n')
      .filter((line) => line.startsWith('| `'))
      .map((line) => line.split('|').map((cell) => cell.trim()))
      .flatMap((cells) => {
        const named =
          /first replayed by run \[(\d+)\]\(https:\/\/github\.com\/async-digital-ltd\/seen-to-fail\/actions\/runs\/(\d+)\)/u.exec(
            cells[2] ?? '',
          );
        if (named === null) {
          return [];
        }
        expect(named[1], 'a run linked under another number').toBe(named[2]);
        return [
          {
            checks: [...(cells[1] ?? '').matchAll(/`([^`]+)`/gu)].map(
              (code) => code[1] ?? '',
            ),
            run: Number(named[1]),
          },
        ];
      });

    expect(rows.flatMap((row) => row.checks).sort()).toStrictEqual(
      [...declared].sort(),
    );
    for (const row of rows) {
      for (const checkId of row.checks) {
        const first = firstReplayOf(checkId);
        expect(first === undefined ? null : runId(first), checkId).toBe(
          row.run,
        );
      }
    }
  });

  it('says the day ci-codegen-check reads Stale from, and that nothing replays it', () => {
    expect(ledger.declared.has('ci-codegen-check')).toBe(false);
    const [day] = onlyMatch(
      prose,
      /Nothing replays it, so it reads Stale from (\d+ \w+ \d{4})/gu,
      'docs/automatic.md',
    );
    const latest = ledger.runs
      .filter((run) => run.checkId === 'ci-codegen-check')
      .map((run) => run.runOn)
      .sort()
      .at(-1);
    if (latest === undefined) {
      throw new Error('ci-codegen-check has no run in the ledger.');
    }
    // Stale once the catch is more than STALE_AFTER_DAYS old, so on the day
    // after that many days have passed.
    const stale = new Date(`${latest}T00:00:00Z`);
    stale.setUTCDate(stale.getUTCDate() + STALE_AFTER_DAYS + 1);
    expect(dayOf(day ?? '')).toBe(stale.toISOString().slice(0, 10));
  });
});

describe('ledger/README.md, where a person writes it', () => {
  const prose = flattened(
    readFileSync(join(ledgerDirectory, 'README.md'), 'utf8'),
  );
  const directory = join(ledgerDirectory, runsDirectory);
  const raw = readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .map(
      (name) =>
        JSON.parse(readFileSync(join(directory, name), 'utf8')) as {
          runOn: string;
          source?: string;
        },
    );
  const sixKeys = raw.filter((run) => run.source === undefined);

  it('counts the hand records written in full and the ones from before `source` existed', () => {
    const [full] = onlyMatch(
      prose,
      /(\w+) hand records in `runs\/` have this shape/gu,
      'ledger/README.md',
    );
    expect(countOf(full ?? '')).toBe(
      raw.filter((run) => run.source === 'hand').length,
    );

    const [before] = onlyMatch(
      prose,
      /The (\w+) before them were written before `source` existed and carry six keys/gu,
      'ledger/README.md',
    );
    expect(countOf(before ?? '')).toBe(sixKeys.length);

    const [ofThatKind, day] = onlyMatch(
      prose,
      /The (\w+) runs in `runs\/` typed in on (\d+ \w+ \d{4}) are of that kind, with six keys and no `source`/gu,
      'ledger/README.md',
    );
    expect(countOf(ofThatKind ?? '')).toBe(sixKeys.length);
    expect([...new Set(sixKeys.map((run) => run.runOn))]).toStrictEqual([
      dayOf(day ?? ''),
    ]);
  });

  it("states the declaration's checks and breaks as canfail.json holds them", () => {
    const [checks, breaks] = onlyMatch(
      prose,
      /The file has declared (\w+) checks and (\w+) breaks between them since/gu,
      'ledger/README.md',
    );
    expect(countOf(checks ?? '')).toBe(ledger.declared.size);
    expect(countOf(breaks ?? '')).toBe(
      [...ledger.declared.values()].reduce((sum, count) => sum + count, 0),
    );
  });
});
