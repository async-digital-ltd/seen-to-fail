import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Where the ledger and its build output sit, worked out once.
 *
 * From this file rather than from the working directory, so the scripts answer
 * the same whether they are run from the repository root, from inside a
 * package, or by a workflow that never changed directory.
 */

/** The repository root, as an absolute path with a trailing separator. */
export const repositoryRoot = fileURLToPath(
  new URL('../../../../', import.meta.url),
);

/**
 * Where the ledger sits inside the repository.
 *
 * Separate from the absolute path below because the export and the commit
 * lookup both need the path as git spells it, which is relative to the root.
 */
export const ledgerPath = 'ledger';

/** The ledger directory, as a path this process can read. */
export const ledgerDirectory = join(repositoryRoot, ledgerPath);

/**
 * Where the build writes the page and the export.
 *
 * Under `dist`, which is already ignored by git. The published output is built
 * from the record and is never committed: committing it would make it a second
 * copy of the record, free to disagree with the first.
 */
export const defaultOutputDirectory = join(repositoryRoot, 'dist', 'ledger');
