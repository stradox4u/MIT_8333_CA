import { Inject } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type * as schema from './schema.js';

/** node-postgres in production, PGlite in tests: the same Drizzle API. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The database's injection token: for factories' `inject` lists and tests. */
export const DATABASE = getDrizzleToken();

/** Injects the database into a class. */
export const InjectDatabase = () => Inject(DATABASE);
