import { InjectDrizzle } from '@nestjs/drizzle';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema.js';

/** node-postgres in production, PGlite in tests: the same Drizzle API. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export const InjectDatabase = InjectDrizzle;
