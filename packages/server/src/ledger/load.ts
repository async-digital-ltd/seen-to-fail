import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IsoDate } from '../database/rows.ts';
import { todayInUtc } from '../day.ts';
import {
  parseLedgerCheck,
  parseLedgerObservation,
  parseLedgerRun,
} from './records.ts';
import type {
  LedgerCheck,
  LedgerObservation,
  LedgerRun,
  ParseResult,
} from './records.ts';

/**
 * Reading the ledger off disk, and refusing everything about it that is wrong.
 *
 * The ledger is three directories of JSON files, one file per record. One file
 * per record is the whole answer to two jobs recording a run at the same time:
 * they write different paths, so there is nothing for git to merge and no
 * moment where one job's record overwrites another's. A file that is appended
 * to would have needed a lock nobody can take.
 *
 * Nothing here is lenient. A file that is not JSON, a record that breaks a
 * rule, a check file whose name and id disagree, a run against a check that
 * does not exist: each is an issue, all of them are collected, and the loader
 * answers with every one rather than the first. A job that has just written a
 * record wants to be told everything wrong with the ledger it is about to
 * commit, not one thing per attempt.
 */

/** Where each kind of record lives, under the ledger directory. */
export const checksDirectory = 'checks';
export const runsDirectory = 'runs';
export const observationsDirectory = 'observations';

/** One thing wrong with the ledger, and where it is. */
export interface LedgerIssue {
  /** The file at fault, relative to the ledger directory. */
  readonly file: string;
  /**
   * The field at fault, spelled the way the file spells it, or the empty
   * string when the whole file is the problem.
   */
  readonly path: string;
  readonly message: string;
}

/** A record and the file it was read from. */
export interface LedgerEntry<Record> {
  /** The file, relative to the ledger directory, such as `runs/x.json`. */
  readonly file: string;
  readonly record: Record;
}

/** Everything the ledger holds, in filename order within each kind. */
export interface LedgerContents {
  readonly checks: readonly LedgerEntry<LedgerCheck>[];
  readonly runs: readonly LedgerEntry<LedgerRun>[];
  readonly observations: readonly LedgerEntry<LedgerObservation>[];
}

/** The ledger, or everything wrong with it. */
export type LoadResult =
  | { readonly ok: true; readonly contents: LedgerContents }
  | { readonly ok: false; readonly issues: readonly LedgerIssue[] };

export interface LoadOptions {
  /** The ledger directory, as a path this process can read. */
  readonly directory: string;
  /**
   * The day the ledger is read on, which is the last day a record may be dated.
   * Passed in so a test can pin it.
   */
  readonly today?: IsoDate;
}

/**
 * The filenames in one of the ledger's directories, in order.
 *
 * A directory that is not there is empty rather than an error: a ledger with no
 * runs recorded yet has no runs directory until the first job writes one, and
 * that is a true state of the world rather than a mistake.
 *
 * Anything that is not a plain file is an issue. A directory nested inside
 * would hold records the loader never reads, which is a record silently absent
 * from the published page: exactly the kind of quiet omission this project is
 * about.
 */
async function filenamesIn(
  directory: string,
  subdirectory: string,
  issues: LedgerIssue[],
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(join(directory, subdirectory), {
      withFileTypes: true,
    });
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
      return [];
    }
    throw cause;
  }

  const filenames: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = `${subdirectory}/${entry.name}`;
    if (!entry.isFile()) {
      issues.push({
        file,
        path: '',
        message: 'Only files belong in a ledger directory.',
      });
      continue;
    }
    if (!entry.name.endsWith('.json')) {
      issues.push({
        file,
        path: '',
        message: 'Every record in the ledger is a .json file.',
      });
      continue;
    }
    filenames.push(entry.name);
  }
  return filenames;
}

/**
 * Reads one directory of records, parsing each file with the given reader and
 * collecting what it refuses.
 */
async function readRecords<Record>(
  options: LoadOptions,
  subdirectory: string,
  parse: (input: unknown) => ParseResult<Record>,
  issues: LedgerIssue[],
): Promise<LedgerEntry<Record>[]> {
  const entries: LedgerEntry<Record>[] = [];

  for (const filename of await filenamesIn(
    options.directory,
    subdirectory,
    issues,
  )) {
    const file = `${subdirectory}/${filename}`;
    const text = await readFile(
      join(options.directory, subdirectory, filename),
      'utf8',
    );

    let input: unknown;
    try {
      input = JSON.parse(text);
    } catch (cause) {
      issues.push({
        file,
        path: '',
        message: `This is not valid JSON: ${cause instanceof Error ? cause.message : 'it could not be read'}.`,
      });
      continue;
    }

    const parsed = parse(input);
    if (!parsed.ok) {
      for (const error of parsed.errors) {
        issues.push({ file, path: error.path, message: error.message });
      }
      continue;
    }
    entries.push({ file, record: parsed.value });
  }

  return entries;
}

/** The filename a check with this id must be written in. */
export function checkFilename(id: string): string {
  return `${checksDirectory}/${id}.json`;
}

/**
 * Reads the whole ledger, or answers with everything wrong with it.
 *
 * The rules that need more than one record in view are applied after the files
 * are read, because they cannot be applied before: whether two checks share an
 * id, and whether a run names a check that exists. A run against a check
 * nobody has written down would otherwise reach the database as a foreign key
 * violation at insert time, which is after it has been committed.
 */
export async function loadLedger(options: LoadOptions): Promise<LoadResult> {
  const today = options.today ?? todayInUtc();
  const issues: LedgerIssue[] = [];

  const checks = await readRecords(
    options,
    checksDirectory,
    parseLedgerCheck,
    issues,
  );
  const runs = await readRecords(
    options,
    runsDirectory,
    (input) => parseLedgerRun(input, today),
    issues,
  );
  const observations = await readRecords(
    options,
    observationsDirectory,
    (input) => parseLedgerObservation(input, today),
    issues,
  );

  const knownIds = new Set<string>();
  for (const entry of checks) {
    const expected = checkFilename(entry.record.id);
    if (entry.file !== expected) {
      issues.push({
        file: entry.file,
        path: 'id',
        message: `A check with this id belongs in ${expected}.`,
      });
    }
    if (knownIds.has(entry.record.id)) {
      issues.push({
        file: entry.file,
        path: 'id',
        message: 'Another check in the ledger already has this id.',
      });
      continue;
    }
    knownIds.add(entry.record.id);
  }

  // The name is a label and nothing here resolves a check by it, but the app
  // keeps names unique and the build writes into the app's own table. Two
  // checks sharing a name would be refused there by checks_name_unique, after
  // both files had been committed. Refused here instead, so a rename onto a
  // name already in use is a validation failure rather than a broken build.
  const holderOfName = new Map<string, string>();
  for (const entry of checks) {
    const holder = holderOfName.get(entry.record.name);
    if (holder !== undefined) {
      issues.push({
        file: entry.file,
        path: 'name',
        message: `Another check in the ledger, ${holder}, already has this name.`,
      });
      continue;
    }
    holderOfName.set(entry.record.name, entry.record.id);
  }

  // The refusal names the address that matched nothing. It is the one thing a
  // workflow input or a plant file wrote about the check, so it is the one thing
  // in the message that tells its author which file to look at. It is safe to
  // echo: an id reaches this loop only after the schema has held it to lower
  // case letters, digits and hyphens.
  for (const entry of [...runs, ...observations]) {
    if (!knownIds.has(entry.record.checkId)) {
      issues.push({
        file: entry.file,
        path: 'checkId',
        message: `There is no check in the ledger with the id ${entry.record.checkId}.`,
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, contents: { checks, runs, observations } };
}

/** What to print when the ledger is refused, one line per issue. */
export function describeIssues(issues: readonly LedgerIssue[]): string {
  return issues
    .map((issue) =>
      issue.path === ''
        ? `${issue.file}: ${issue.message}`
        : `${issue.file}: ${issue.path}: ${issue.message}`,
    )
    .join('\n');
}
