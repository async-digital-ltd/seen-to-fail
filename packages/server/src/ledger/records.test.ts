import { describe, expect, it } from 'vitest';

import { MAX_TEXT_LENGTH } from '../database/new-records.ts';
import {
  parseLedgerCheck,
  parseLedgerObservation,
  parseLedgerRun,
} from './records.ts';
import type { ParseResult } from './records.ts';

/**
 * What the ledger refuses, one rule at a time.
 *
 * A record reaches the ledger as a file somebody or something wrote, and once
 * it is committed it is published. So every rule here is a rule about what
 * never becomes a commit, and each one is exercised by a record that breaks it
 * and nothing else, so a rule deleted from the reader takes a test with it.
 */

/** The day every fixture is judged against. */
const today = '2026-09-18';

const soundCheck = {
  id: 'ci-lint',
  name: 'Lint',
  area: 'CI',
  protects: 'A lint rule being broken on main.',
  howToTellArmed: 'The step appears in the run list.',
};

const soundRun = {
  checkId: 'ci-lint',
  runOn: '2026-09-18',
  planted: 'A rule violation.',
  expected: 'The lint step fails.',
  outcome: 'caught',
};

const soundObservation = {
  checkId: 'ci-lint',
  observedOn: '2026-09-18',
  armed: true,
};

/** The field each issue was reported against, in the order they came back. */
function fieldsAtFault(result: ParseResult<unknown>): string[] {
  return result.ok ? [] : result.errors.map((issue) => issue.path);
}

describe('a check', () => {
  it('is accepted when every field is written', () => {
    const result = parseLedgerCheck(soundCheck);
    expect(result.ok && result.value.id).toBe('ci-lint');
  });

  it('may leave what it protects and its tell unwritten', () => {
    const result = parseLedgerCheck({
      ...soundCheck,
      protects: '',
      howToTellArmed: '',
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ['CI-Lint', 'a capital letter'],
    ['ci_lint', 'an underscore'],
    ['ci--lint', 'two hyphens together'],
    ['-ci-lint', 'a leading hyphen'],
    ['ci lint', 'a space'],
    ['', 'nothing at all'],
  ])('refuses the id %s, which has %s', (id) => {
    expect(fieldsAtFault(parseLedgerCheck({ ...soundCheck, id }))).toEqual([
      'id',
    ]);
  });

  it('refuses a name that is only spaces, as a form does', () => {
    expect(
      fieldsAtFault(parseLedgerCheck({ ...soundCheck, name: '   ' })),
    ).toEqual(['name']);
  });

  it('refuses text longer than the database column is meant to hold', () => {
    expect(
      fieldsAtFault(
        parseLedgerCheck({
          ...soundCheck,
          protects: 'x'.repeat(MAX_TEXT_LENGTH + 1),
        }),
      ),
    ).toEqual(['protects']);
  });

  /**
   * The rule that matters most, because breaking it is silent everywhere else.
   * A key nobody reads is a field somebody wrote and the ledger ignored, and a
   * reader of the file would have no way to tell.
   */
  it('refuses a key it does not know', () => {
    const result = parseLedgerCheck({ ...soundCheck, sevrity: 'high' });
    expect(result.ok).toBe(false);
  });

  it('refuses a missing field rather than filling it in', () => {
    const { id, name, protects, howToTellArmed } = soundCheck;
    expect(
      fieldsAtFault(parseLedgerCheck({ id, name, protects, howToTellArmed })),
    ).toEqual(['area']);
  });
});

describe('a run', () => {
  it('is accepted, and a run with no note is a run with a null note', () => {
    const result = parseLedgerRun(soundRun, today);
    expect(result.ok && result.value.note).toBeNull();
  });

  it('keeps a note that was written', () => {
    const result = parseLedgerRun({ ...soundRun, note: 'Seen twice.' }, today);
    expect(result.ok && result.value.note).toBe('Seen twice.');
  });

  it.each(['caught', 'missed'])('accepts the outcome %s', (outcome) => {
    expect(parseLedgerRun({ ...soundRun, outcome }, today).ok).toBe(true);
  });

  it('refuses an outcome the record has no column for', () => {
    expect(
      fieldsAtFault(parseLedgerRun({ ...soundRun, outcome: 'passed' }, today)),
    ).toEqual(['outcome']);
  });

  it('refuses a day that is shaped like one and is not one', () => {
    expect(
      fieldsAtFault(
        parseLedgerRun({ ...soundRun, runOn: '2026-02-30' }, today),
      ),
    ).toEqual(['runOn']);
  });

  /**
   * The rule the database also enforces, applied here because the database
   * applies it after the record has been committed. By then the record is in
   * the history whether it is accepted or not.
   */
  it('refuses a run dated after the day it is being read on', () => {
    expect(
      fieldsAtFault(
        parseLedgerRun({ ...soundRun, runOn: '2026-09-19' }, today),
      ),
    ).toEqual(['runOn']);
  });

  it('accepts a run dated today, which is the boundary', () => {
    expect(parseLedgerRun({ ...soundRun, runOn: today }, today).ok).toBe(true);
  });

  it('refuses a run that says nothing about what was planted', () => {
    expect(
      fieldsAtFault(parseLedgerRun({ ...soundRun, planted: '' }, today)),
    ).toEqual(['planted']);
  });
});

describe('an arming observation', () => {
  it('is accepted', () => {
    expect(parseLedgerObservation(soundObservation, today).ok).toBe(true);
  });

  it('refuses an observation dated after today', () => {
    expect(
      fieldsAtFault(
        parseLedgerObservation(
          { ...soundObservation, observedOn: '2026-09-19' },
          today,
        ),
      ),
    ).toEqual(['observedOn']);
  });

  /**
   * Whether a check is on is a fact with two values, and a string that looks
   * like one of them is not one of them. "false" is true to anything that
   * coerces, which is how a check that is off gets published as on.
   */
  it('refuses armed written as text', () => {
    expect(
      fieldsAtFault(
        parseLedgerObservation({ ...soundObservation, armed: 'false' }, today),
      ),
    ).toEqual(['armed']);
  });
});
