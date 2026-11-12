import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../src/database/schema.js';

/** Tables holding reference data that the migrations insert, kept across resets. */
const REFERENCE_TABLES = ['roles'];

/**
 * An in-process Postgres (PGlite) with the real migrations applied. `reset()`
 * empties every table except the reference data, so each test starts clean
 * without paying for a new database.
 */
export async function createTestDatabase() {
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
    },
    close: () => client.close(),
  };
}
