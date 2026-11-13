import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../src/database/schema.js';
import type { Database } from '../../src/database/database.js';

export interface TestDatabase {
  db: Database;
  reset(): Promise<void>;
  mentions(text: string): Promise<boolean>;
  close(): Promise<void>;
}

/** Tables holding reference data that the migrations insert, kept across resets. */
const REFERENCE_TABLES = ['roles', 'request_categories'];

/**
 * An in-process Postgres (PGlite) with the real migrations applied. `reset()`
 * empties every table except the reference data, so each test starts clean
 * without paying for a new database.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: 'snake_case' });
  await migrate(db, {
    migrationsFolder: join(import.meta.dirname, '../../drizzle'),
  });

  const { rows } = await client.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public'`,
  );
  const tables = rows
    .map((row) => row.tablename)
    .filter((table) => !REFERENCE_TABLES.includes(table))
    .map((table) => `"${table}"`);

  return {
    db,
    async reset() {
      if (tables.length > 0) {
        await client.exec(`truncate ${tables.join(', ')} cascade`);
      }
      // Each test's References start again from 1.
      await client.exec('update request_categories set last_number = 0');
    },
    /** Whether any row of any table contains `text`: for data-protection checks. */
    async mentions(text: string) {
      for (const table of tables) {
        const { rows } = await client.query(
          `select 1 from ${table} t where t::text ilike $1 limit 1`,
          [`%${text}%`],
        );
        if (rows.length > 0) {
          return true;
        }
      }
      return false;
    },
    close: () => client.close(),
  };
}
