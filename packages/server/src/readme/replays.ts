import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parsePlantedChecks } from '@seen-to-fail/replay';

import { checksDirectory, runsDirectory } from '../ledger/load.ts';
import { ledgerPath, repositoryRoot } from '../ledger/location.ts';
import { writtenCount } from './readme.ts';

/**
 * The counts a replay moves, written from `ledger/` and `canfail.json` rather
 * than by hand (#243).
 *
 * Every replay that is merged adds runs, so every count of runs, every "how
 * many came from a replay" and every "latest replay" in the documentation goes
 * false the moment one lands. On 5 October 2026 the section "How much of this
 * record is automatic" went false within hours of the merges it described, and
 * on 20 October 2026 three pull requests corrected counts in it and in
 * `ledger/README.md` by hand. A test holding those numbers would fail on every
 * replay pull request and teach whoever landed it to bump the number without
 * reading the sentence, so they were generated instead, into blocks
 * `pnpm readme` rewrote and a test held.
 *
 * Committing them had its own cost (#270). Every replay branch rewrote the same
 * lines from the ledger as it stood when that branch ran, so two branches
 * waiting at once always conflicted, and a newly declared check failed the
 * tests until a replay had run against it. So nothing here is committed any
 * more: `pnpm ledger:counts` prints the tables from the tree as it stands, and
 * the published page shows every run and status from the same ledger at build
 * time. What a person still writes in the documentation is the part a replay
 * cannot move: why a check is declared and where a hand run came from.
 *
 * Nothing here reads the day it runs on or the git history, so the same tree
 * always writes the same text, whichever day and machine it is written on.
 */

/** One run in `ledger/runs/`, as far as these counts need one. */
export interface LedgerRun {
  readonly checkId: string;
  readonly runOn: string;
  /** `hand` for a run typed in, including one written before `source` existed. */
  readonly source: 'hand' | 'replay';
  /** The run that produced a replay record, or null for one typed in. */
  readonly sourceRunUrl: string | null;
}

/** What the counts are written from. */
export interface ReplayRecord {
  /** Every check id in `ledger/checks/`, sorted. */
  readonly checks: readonly string[];
  /** Every check `canfail.json` declares, by id, with its number of breaks. */
  readonly declared: ReadonlyMap<string, number>;
  readonly runs: readonly LedgerRun[];
}

function jsonFilesIn(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

function stringField(record: object, key: string): string | null {
  const value: unknown = (record as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/**
 * The ledger and the declaration as they stand under `root`.
 *
 * `pnpm ledger:validate` is what refuses a malformed record, and CI runs it
 * beside the test that holds these blocks. This reads only the fields it
 * counts, and refuses a run missing one of them rather than counting around
 * it, so a record this cannot read fails loudly here too.
 */
export function readReplayRecord(root: string = repositoryRoot): ReplayRecord {
  const ledger = join(root, ledgerPath);
  const checks = jsonFilesIn(join(ledger, checksDirectory)).map((name) =>
    name.replace(/\.json$/u, ''),
  );

  const runsPath = join(ledger, runsDirectory);
  const runs = jsonFilesIn(runsPath).map((name): LedgerRun => {
    const record: unknown = JSON.parse(
      readFileSync(join(runsPath, name), 'utf8'),
    );
    if (typeof record !== 'object' || record === null) {
      throw new Error(`${ledgerPath}/runs/${name} is not a JSON object.`);
    }
    const checkId = stringField(record, 'checkId');
    const runOn = stringField(record, 'runOn');
    if (checkId === null || runOn === null) {
      throw new Error(
        `${ledgerPath}/runs/${name} has no checkId or no runOn to count it by.`,
      );
    }
    const source =
      stringField(record, 'source') === 'replay' ? 'replay' : 'hand';
    return {
      checkId,
      runOn,
      source,
      sourceRunUrl:
        source === 'replay' ? stringField(record, 'sourceRunUrl') : null,
    };
  });

  const parsed = parsePlantedChecks(
    JSON.parse(readFileSync(join(root, 'canfail.json'), 'utf8')) as unknown,
  );
  if (!parsed.ok) {
    throw new Error(`canfail.json does not read: ${parsed.problems.join(' ')}`);
  }
  const declared = new Map(
    [...parsed.value.values()].map((check) => [
      check.checkId,
      check.breaks.length,
    ]),
  );

  return { checks, declared, runs };
}

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

/** A day in `YYYY-MM-DD` as the documentation writes one: `5 October 2026`. */
export function writtenDay(day: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day);
  const month = months[Number(parts?.[2]) - 1];
  if (parts === null || month === undefined) {
    throw new Error(`"${day}" is not a day these blocks can write.`);
  }
  return `${String(Number(parts[3]))} ${month} ${parts[1] ?? ''}`;
}

function capitalised(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

const ordinalWords = [
  'zeroth',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
  'sixteenth',
  'seventeenth',
  'eighteenth',
  'nineteenth',
  'twentieth',
];

/** A position in words up to the twentieth, and as `21st` and so on beyond. */
export function writtenOrdinal(position: number): string {
  const word = ordinalWords[position];
  if (word !== undefined) {
    return word;
  }
  const tens = position % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? 'th'
      : (['th', 'st', 'nd', 'rd'][position % 10] ?? 'th');
  return `${String(position)}${suffix}`;
}

/** What one check's record rests on, counted. */
interface CheckCounts {
  readonly checkId: string;
  /** Its declared breaks, or null for a check `canfail.json` does not declare. */
  readonly breaks: number | null;
  readonly replayed: number;
  readonly handDays: readonly string[];
  readonly firstReplay: string | null;
  readonly latestReplay: string | null;
}

function countsFor(record: ReplayRecord): CheckCounts[] {
  return record.checks.map((checkId) => {
    const runs = record.runs.filter((run) => run.checkId === checkId);
    const replayDays = runs
      .filter((run) => run.source === 'replay')
      .map((run) => run.runOn)
      .sort();
    return {
      checkId,
      breaks: record.declared.get(checkId) ?? null,
      replayed: replayDays.length,
      handDays: runs
        .filter((run) => run.source === 'hand')
        .map((run) => run.runOn)
        .sort(),
      firstReplay: replayDays.at(0) ?? null,
      latestReplay: replayDays.at(-1) ?? null,
    };
  });
}

/**
 * A Markdown table laid out the way Prettier lays one out, so that
 * `pnpm format:check` and the generated-block test agree about it: every cell
 * padded to its column's width, and the delimiter row's dashes as wide as the
 * column. Only for cells of plain ASCII, where a character is one column wide.
 */
export function markdownTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const widths = header.map((cell, column) =>
    Math.max(3, cell.length, ...rows.map((row) => (row[column] ?? '').length)),
  );
  const line = (cells: readonly string[]): string =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join(' | ')} |`;
  return [
    line(header),
    line(widths.map((width) => '-'.repeat(width))),
    ...rows.map(line),
  ].join('\n');
}

/**
 * Every check in `ledger/checks/`, one row each, with what its record rests
 * on: whether `canfail.json` declares it and how many breaks, how many runs it
 * carries, how many of those a replay wrote and how many were typed in by hand
 * and on which days, and the days of its first and its latest replay.
 */
export function replayTable(record: ReplayRecord = readReplayRecord()): string {
  const rows = countsFor(record).map((check) => [
    `\`${check.checkId}\``,
    check.breaks === null ? 'Not declared' : String(check.breaks),
    String(check.replayed + check.handDays.length),
    String(check.replayed),
    check.handDays.length === 0
      ? '0'
      : `${String(check.handDays.length)} (${check.handDays.map(writtenDay).join(', ')})`,
    check.firstReplay === null ? 'Never' : writtenDay(check.firstReplay),
    check.latestReplay === null ? 'Never' : writtenDay(check.latestReplay),
  ]);
  return `\n${markdownTable(
    [
      'Check',
      'Declared breaks',
      'Runs',
      'From a replay',
      'Typed in by hand',
      'First replayed',
      'Latest replay',
    ],
    rows,
  )}\n`;
}

/** The distinct replays with runs in the ledger, in the order they ran. */
function replaysIn(record: ReplayRecord): { url: string; runs: LedgerRun[] }[] {
  const byUrl = new Map<string, LedgerRun[]>();
  for (const run of record.runs) {
    if (run.source !== 'replay') {
      continue;
    }
    if (run.sourceRunUrl === null) {
      throw new Error(
        `A replay of ${run.checkId} on ${run.runOn} names no run that produced it.`,
      );
    }
    byUrl.set(run.sourceRunUrl, [...(byUrl.get(run.sourceRunUrl) ?? []), run]);
  }
  // A GitHub Actions run id grows with every run, so it orders two replays
  // that ran on the same day, which their days alone cannot.
  const id = (url: string): number => Number(/(\d+)$/u.exec(url)?.[1] ?? NaN);
  return [...byUrl]
    .map(([url, runs]) => ({ url, runs }))
    .sort((a, b) => id(a.url) - id(b.url));
}

/** The latest day a replay ran, or null when nothing has been replayed. */
function latestReplayDay(record: ReplayRecord): string | null {
  return (
    record.runs
      .filter((run) => run.source === 'replay')
      .map((run) => run.runOn)
      .sort()
      .at(-1) ?? null
  );
}

/**
 * The section's totals: how many checks there are, how many are declared, how
 * many have been replayed and how many carry a run, and how many runs there
 * are by where they came from.
 */
export function replayTotals(
  record: ReplayRecord = readReplayRecord(),
): string {
  const counts = countsFor(record);
  const checks = counts.length;
  const declared = counts.filter((check) => check.breaks !== null).length;
  const replayed = counts.filter((check) => check.replayed > 0).length;
  const withRun = counts.filter(
    (check) => check.replayed + check.handDays.length > 0,
  ).length;
  const fromReplay = record.runs.filter(
    (run) => run.source === 'replay',
  ).length;
  const byHand = record.runs.length - fromReplay;
  const replays = replaysIn(record).length;
  const latest = latestReplayDay(record);

  const all = (part: number, whole: number): string => {
    if (part !== whole || whole < 2) {
      return writtenCount(part);
    }
    return whole === 2 ? 'both' : `all ${writtenCount(part)}`;
  };

  const sentences = [
    `${capitalised(writtenCount(checks))} checks are on the page, ${writtenCount(declared)} of them are declared for replay, and ${all(replayed, declared)} ${replayed === 1 ? 'has' : 'have'} been replayed.`,
    `${capitalised(all(withRun, checks))} ${withRun === 1 ? 'has' : 'have'} a run behind ${withRun === 1 ? 'it' : 'them'}.`,
    `\`ledger/runs/\` holds ${writtenCount(record.runs.length)} runs: ${writtenCount(fromReplay)} came from ${writtenCount(replays)} ${replays === 1 ? 'replay' : 'replays'} and ${writtenCount(byHand)} ${byHand === 1 ? 'was' : 'were'} typed in by hand.`,
  ];
  if (latest !== null) {
    sentences.push(
      `The latest replay among them ran on ${writtenDay(latest)}.`,
    );
  }
  return `\n${sentences.join(' ')}\n`;
}

/**
 * How many runs each replay with records in `ledger/runs/` wrote, in the order
 * they ran, for `ledger/README.md`. A run of replays that wrote the same number
 * is said once for all of them.
 */
export function runsPerReplay(
  record: ReplayRecord = readReplayRecord(),
): string {
  const replays = replaysIn(record);
  const latest = latestReplayDay(record);
  if (latest === null) {
    return '\nNo replay has written a run yet.\n';
  }

  const groups: { from: number; to: number; count: number }[] = [];
  for (const [index, replay] of replays.entries()) {
    const position = index + 1;
    const last = groups.at(-1);
    if (last?.count === replay.runs.length) {
      last.to = position;
    } else {
      groups.push({ from: position, to: position, count: replay.runs.length });
    }
  }

  const phrases = groups.map(({ from, to, count }) => {
    const many = writtenCount(count);
    if (from === to) {
      return `${many} for the ${writtenOrdinal(from)}`;
    }
    if (from === 1) {
      return `${many} for each of the first ${writtenCount(to)}`;
    }
    if (to === from + 1) {
      return `${many} each for the ${writtenOrdinal(from)} and ${writtenOrdinal(to)}`;
    }
    return `${many} each for the ${writtenOrdinal(from)} to the ${writtenOrdinal(to)}`;
  });
  const listed =
    phrases.length === 1
      ? (phrases[0] ?? '')
      : `${phrases.slice(0, -1).join(', ')}${phrases.length > 2 ? ',' : ''} and ${phrases.at(-1) ?? ''}`;

  return `\nUp to the replay of ${writtenDay(latest)}, ${writtenCount(replays.length)} ${replays.length === 1 ? 'replay has' : 'replays have'} written runs here: ${listed}.\n`;
}
