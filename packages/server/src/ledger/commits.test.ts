import { describe, expect, it } from 'vitest';

import { parseAddingCommits, repositoryFromRemote } from './commits.ts';

/**
 * Reading the history is done by git; what is tested here is the reading of
 * what git said. Both of these turn text into a fact the published page states,
 * and a wrong answer from either one is a page that looks entirely normal and
 * links to the wrong place, or to nowhere.
 */

/** The marker the log format puts in front of each hash. */
const marker = '\u0001';

function log(...lines: readonly string[]): string {
  return `${lines.join('\n')}\n`;
}

describe('the commit that added each file', () => {
  it('reads a file back to the commit that added it', () => {
    const commits = parseAddingCommits(
      log(`${marker}aaa`, '', 'ledger/runs/one.json', ''),
    );
    expect(commits.get('ledger/runs/one.json')).toBe('aaa');
  });

  it('reads every file a commit added', () => {
    const commits = parseAddingCommits(
      log(
        `${marker}aaa`,
        '',
        'ledger/runs/one.json',
        'ledger/runs/two.json',
        '',
      ),
    );
    expect([...commits.values()]).toEqual(['aaa', 'aaa']);
  });

  it('keeps each commit to the files it added', () => {
    const commits = parseAddingCommits(
      log(
        `${marker}bbb`,
        '',
        'ledger/runs/two.json',
        '',
        `${marker}aaa`,
        '',
        'ledger/runs/one.json',
        '',
      ),
    );
    expect(commits.get('ledger/runs/one.json')).toBe('aaa');
    expect(commits.get('ledger/runs/two.json')).toBe('bbb');
  });

  /**
   * git prints newest first, so a file added, deleted and added again appears
   * twice. The commit that recorded it is the first one, which is the last one
   * printed.
   */
  it('answers with the oldest commit that added a file', () => {
    const commits = parseAddingCommits(
      log(
        `${marker}ccc`,
        '',
        'ledger/runs/one.json',
        '',
        `${marker}aaa`,
        '',
        'ledger/runs/one.json',
        '',
      ),
    );
    expect(commits.get('ledger/runs/one.json')).toBe('aaa');
  });

  it('finds nothing in an empty log, rather than inventing a commit', () => {
    expect(parseAddingCommits('').size).toBe(0);
  });
});

describe('the repository a remote names', () => {
  it.each([
    ['git@github.com:async-digital-ltd/seen-to-fail.git', 'ssh, with .git'],
    ['git@github.com:async-digital-ltd/seen-to-fail', 'ssh, without'],
    ['https://github.com/async-digital-ltd/seen-to-fail.git', 'https, with'],
    ['https://github.com/async-digital-ltd/seen-to-fail', 'https, without'],
    [
      'https://github.com/async-digital-ltd/seen-to-fail\n',
      'as git prints it, with a newline',
    ],
  ])('reads %s (%s)', (url) => {
    expect(repositoryFromRemote(url)).toBe('async-digital-ltd/seen-to-fail');
  });

  it.each([['/some/local/path'], ['not a url'], ['']])(
    'answers with nothing for %s, rather than a guess',
    (url) => {
      expect(repositoryFromRemote(url)).toBeNull();
    },
  );
});
