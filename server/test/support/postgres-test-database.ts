import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as schema from '../../src/database/schema.js';
import type { TestDatabase } from './test-database.js';

/** Each suite owns a fresh database; existing databases are untouched. */
export async function createPostgresTestDatabase() {
  const connectionString = process.env.TEST_POSTGRES_URL;
  if (!connectionString) {
    throw new Error(
      'Set TEST_POSTGRES_URL to run the Postgres concurrency tests',
    );
  }
  const name = `test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString, max: 1 });
  try {
    await admin.query(`create database "${name}"`);
  } catch (error) {
    await admin.end();
    throw error;
  }
  const testUrl = new URL(connectionString);
  testUrl.pathname = `/${name}`;
  const pool = new pg.Pool({
    connectionString: testUrl.href,
    max: 8,
    application_name: name,
    options: '-c statement_timeout=10000',
  });
  const close = async () => {
    await pool.end();
    try {
      await admin.query(`drop database "${name}"`);
    } finally {
      await admin.end();
    }
  };
  try {
    const db = drizzle({ client: pool, schema, casing: 'snake_case' });
    await migrate(db, {
      migrationsFolder: join(import.meta.dirname, '../../drizzle'),
    });
    const { rows } = await pool.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    const tables = rows
      .map(({ tablename }) => tablename)
      .filter((table) => !['roles', 'request_categories'].includes(table))
      .map((table) => `"${table}"`);
    const database: TestDatabase = {
      db,
      async reset() {
        await pool.query(`truncate ${tables.join(', ')} cascade`);
        await pool.query('update request_categories set last_number = 0');
      },
      async mentions(text) {
        for (const table of tables) {
          const result = await pool.query(
            `select 1 from ${table} t where t::text ilike $1 limit 1`,
            [`%${text}%`],
          );
          if (result.rowCount) return true;
        }
        return false;
      },
      close,
    };
    return {
      ...database,
      pool,
      /** Wait for a real lock dependency rather than guessing a sleep duration. */
      async waitForBlockedTransactions(count: number) {
        const deadline = Date.now() + 5_000;
        do {
          const result = await pool.query<{ count: number }>(
            `select count(*)::integer as count from pg_stat_activity
             where application_name = $1 and cardinality(pg_blocking_pids(pid)) > 0`,
            [name],
          );
          if (result.rows[0].count >= count) return;
          await delay(10);
        } while (Date.now() < deadline);
        throw new Error(`Expected ${count} blocked test transactions`);
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
