// Give the browser its own empty database on the configured test server.
// The production entry point reads DATABASE_URL, so only the child receives
// the temporary URL. Playwright starts and stops the real API and Vite.
import '../environment.ts';

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { loadDatabaseConfig } from '../config.ts';
import { quoteIdentifier } from '../database/identifiers.ts';
import { applyMigrations } from '../database/migrations.ts';

const { testDatabaseUrl } = loadDatabaseConfig();
const url = new URL(testDatabaseUrl);
url.searchParams.delete('database');
url.pathname = '/postgres';
const admin = new Client({ connectionString: url.toString() });
const name = 'stf_browser_' + randomUUID().replaceAll('-', '');

await admin.connect();
try {
  await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
  try {
    url.pathname = '/' + name;
    const databaseUrl = url.toString();
    await applyMigrations({ databaseUrl });
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(import.meta.resolve('@playwright/test/cli')),
        'test',
        '--config',
        'browser-tests/playwright.config.js',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, DATABASE_URL: databaseUrl },
      },
    );
    const interrupt = () => {
      child.kill('SIGINT');
    };
    process.once('SIGTERM', interrupt);
    process.once('SIGINT', interrupt);
    try {
      process.exitCode = await new Promise<number>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => {
          resolve(code ?? 1);
        });
      });
    } finally {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
    }
  } finally {
    await admin.query(`DROP DATABASE ${quoteIdentifier(name)} WITH (FORCE)`);
  }
} finally {
  await admin.end();
}
