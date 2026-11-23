import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { quoteIdentifier } from './identifiers.ts';

/** The project's own migrations, as an absolute path. */
export const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

/** The table that records each applied filename and its SQL digest. */
export const migrationsTable = 'schema_migrations';

/**
 * One advisory lock key, shared by every migration run against a database.
 * Two runners on the same database queue instead of racing: the second one
 * waits, then finds the first one's work already recorded and applies nothing.
 * The lock is held on the connection, so ending the connection releases it
 * even when a migration throws.
 */
const advisoryLockKey = 8_142_317;

export interface MigrateOptions {
  /** The database to apply migrations to. */
  readonly databaseUrl: string;
  /** Where the .sql files are. Defaults to the project's own migrations. */
  readonly directory?: string;
  /** Where applied filenames and SQL digests are stored. Defaults to schema_migrations. */
  readonly table?: string;
}

/**
 * Applies every migration the database has not recorded yet, in filename order,
 * and returns the filenames it applied. Checks the digest of previously applied
 * SQL and reports changed files. Older rows with no digest get one summary.
 *
 * Each migration and its bookkeeping row go in one transaction, so a migration
 * that fails leaves neither its own changes nor a record claiming it ran.
 */
export async function applyMigrations(
  options: MigrateOptions,
): Promise<string[]> {
  const directory = options.directory ?? migrationsDirectory;
  const table = quoteIdentifier(options.table ?? migrationsTable);
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockKey]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${table} (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );

    // A database created by an earlier runner has names but no evidence of
    // which SQL it applied. Leave those digests null until a fresh application.
    await client.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS sha256 text`,
    );
    const recorded = await client.query<{
      filename: string;
      sha256: string | null;
    }>(`SELECT filename, sha256 FROM ${table}`);
    const digests = new Map(
      recorded.rows.map((row) => [row.filename, row.sha256]),
    );
    const unverified = recorded.rows
      .filter((row) => row.sha256 === null)
      .map((row) => row.filename)
      .sort();
    if (unverified.length > 0) {
      console.warn(
        `Cannot verify SQL applied before digests were recorded: ${unverified.join(', ')}.`,
      );
    }

    const applied: string[] = [];
    for (const filename of await migrationFilenames(directory)) {
      const sql = await readFile(join(directory, filename), 'utf8');
      const digest = createHash('sha256').update(sql).digest('hex');
      const previous = digests.get(filename);
      if (previous !== undefined) {
        if (previous !== null && previous !== digest) {
          console.warn(
            `Migration ${filename} has changed since it was applied. The database still has the earlier version.`,
          );
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO ${table} (filename, sha256) VALUES ($1, $2)`,
          [filename, digest],
        );
        await client.query('COMMIT');
      } catch (cause) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${filename} failed and was not recorded.`, {
          cause,
        });
      }
      applied.push(filename);
    }
    return applied;
  } finally {
    await client.end();
  }
}

/**
 * The migration filenames in the order they should be applied. They are
 * numbered and zero padded, so sorting them as text is sorting them by number.
 */
async function migrationFilenames(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  return entries.filter((name) => name.endsWith('.sql')).sort();
}
