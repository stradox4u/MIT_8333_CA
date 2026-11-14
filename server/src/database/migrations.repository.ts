import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

/** Applies the checked-in SQL without requiring the Nest application to start. */
export class MigrationsRepository {
  constructor(private readonly databaseUrl: string) {}

  async migrate(): Promise<void> {
    const pool = new Pool({ connectionString: this.databaseUrl });
    try {
      await migrate(drizzle(pool), {
        migrationsFolder: fileURLToPath(
          new URL('../../drizzle/', import.meta.url),
        ),
      });
    } finally {
      await pool.end();
    }
  }
}
