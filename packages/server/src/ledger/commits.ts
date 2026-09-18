import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Which commit recorded each file in the ledger.
 *
 * The published page has to link a run to the commit that recorded it, and
 * nothing in the run's own file can say what that commit is: the sha does not
 * exist until the file has been committed, and a field written beforehand could
 * only ever be a guess. So it is read back out of the history rather than
 * stored, which also means it cannot be wrong on purpose. A run that claims to
 * have been recorded by a commit that did not add it is not expressible here.
 */

/**
 * The marker git is told to print before each commit's hash, so the hashes can
 * be told apart from the filenames that follow them. A control character,
 * because a filename cannot contain one and git will not escape it away.
 */
const commitMarker = '\u0001';

/**
 * Turns `git log --diff-filter=A --name-only` output into the commit that added
 * each path.
 *
 * git prints newest first, and a path can be added more than once: added,
 * deleted, and added again. The later entry overwrites the earlier one as the
 * loop runs backwards through time, so what is left is the oldest commit that
 * added the path, which is the commit that first recorded it.
 */
export function parseAddingCommits(log: string): Map<string, string> {
  const commits = new Map<string, string>();
  let commit: string | null = null;

  for (const line of log.split('\n')) {
    if (line.startsWith(commitMarker)) {
      commit = line.slice(commitMarker.length).trim();
      continue;
    }
    const path = line.trim();
    if (path === '' || commit === null) {
      continue;
    }
    commits.set(path, commit);
  }

  return commits;
}

async function git(
  repositoryRoot: string,
  ...args: readonly string[]
): Promise<string> {
  const { stdout } = await run('git', ['-C', repositoryRoot, ...args], {
    // A history long enough to pass the default megabyte is not this project's,
    // but a truncated log would answer "no commit recorded this" for every file
    // past the cut, which reads exactly like an honest answer.
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Whether the checkout has had its history cut short.
 *
 * This is the one question that has to be asked before the log is trusted. A
 * shallow clone, which is what `actions/checkout` makes by default, holds one
 * commit, so `git log` finds no commit that added any file and every run on the
 * published page would say it was never recorded. Nothing about that looks
 * wrong: the page renders, the build passes, and the answer is silently false
 * for every row. So the build refuses rather than publishing it.
 */
export async function isShallowRepository(
  repositoryRoot: string,
): Promise<boolean> {
  return (
    (
      await git(repositoryRoot, 'rev-parse', '--is-shallow-repository')
    ).trim() === 'true'
  );
}

/** The commit the build is running against. */
export async function currentCommit(repositoryRoot: string): Promise<string> {
  return (await git(repositoryRoot, 'rev-parse', 'HEAD')).trim();
}

/**
 * The commit that added each file under a path, keyed by the path as git spells
 * it: relative to the repository root, with forward slashes.
 *
 * A file that has not been committed is absent from the map rather than present
 * with a null, so a caller has to decide what to say about it. The page says it
 * has not been committed yet, which is true of a record somebody is drafting
 * locally and never true of one in the published build.
 */
export async function commitsThatAdded(
  repositoryRoot: string,
  pathspec: string,
): Promise<Map<string, string>> {
  if (await isShallowRepository(repositoryRoot)) {
    throw new Error(
      'This is a shallow clone, so the commit that recorded each run cannot ' +
        'be read. Check the repository out with its full history.',
    );
  }

  return parseAddingCommits(
    await git(
      repositoryRoot,
      'log',
      '--diff-filter=A',
      '--name-only',
      `--format=${commitMarker}%H`,
      '--',
      pathspec,
    ),
  );
}

/**
 * The owner and repository a remote URL names, or null when it names neither.
 *
 * Both shapes GitHub hands out are accepted, because a checkout made by
 * `actions/checkout` and one made by a person over ssh disagree about which one
 * they use, and the published page's links must not depend on which of them
 * built it.
 */
export function repositoryFromRemote(url: string): string | null {
  const trimmed = url.trim().replace(/\.git$/, '');
  const ssh = /^git@[^:]+:(?<path>[^/]+\/[^/]+)$/.exec(trimmed);
  if (ssh?.groups?.path !== undefined) {
    return ssh.groups.path;
  }
  const https = /^https?:\/\/[^/]+\/(?<path>[^/]+\/[^/]+)$/.exec(trimmed);
  return https?.groups?.path ?? null;
}

/** The owner and repository this checkout's origin remote names. */
export async function repositoryFromOrigin(
  repositoryRoot: string,
): Promise<string | null> {
  return repositoryFromRemote(
    await git(repositoryRoot, 'remote', 'get-url', 'origin'),
  );
}
