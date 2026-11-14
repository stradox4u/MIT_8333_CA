import { Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { InjectDatabase, type Database } from '../database/database.js';
import { requestCategories } from '../database/schema.js';
import type { RequestCategory } from './service-request.responses.js';

/** The columns of a `RequestCategory`, wherever one is shown. */
export const requestCategoryColumns = {
  id: requestCategories.id,
  name: requestCategories.name,
  code: requestCategories.code,
} satisfies Record<keyof RequestCategory, AnyPgColumn>;

/** The six Request Categories: reference data, inserted by a migration. */
@Injectable()
export class RequestCategoriesRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /** In their display order, Other last. */
  list(): Promise<RequestCategory[]> {
    return this.db
      .select(requestCategoryColumns)
      .from(requestCategories)
      .orderBy(asc(requestCategories.sortOrder));
  }
}
