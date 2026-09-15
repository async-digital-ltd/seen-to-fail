import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { quoteIdentifier } from './identifiers.ts';

/** The project's own migrations, as an absolute path. */
export const migrationsDirectory = fileURLToPath(
  new URL('../../migrations/', import.meta.url),
);

/** The table the runner records applied filenames in. */
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
  /** Where applied filenames are recorded. Defaults to schema_migrations. */
  readonly table?: string;
}

/**
 * Applies every migration the database has not recorded yet, in filename order,
 * and returns the filenames it applied. A run with nothing pending returns an
 * empty array and changes nothing.
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

    const recorded = await client.query<{ filename: string }>(
      `SELECT filename FROM ${table}`,
    );
    const alreadyApplied = new Set(recorded.rows.map((row) => row.filename));
    const pending = (await migrationFilenames(directory)).filter(
      (filename) => !alreadyApplied.has(filename),
    );

    const applied: string[] = [];
    for (const filename of pending) {
      const sql = await readFile(join(directory, filename), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO ${table} (filename) VALUES ($1)`, [
          filename,
        ]);
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
