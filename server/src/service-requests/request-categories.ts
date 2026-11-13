import { Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { InjectDatabase, type Database } from '../database/database.js';
import { requestCategories } from '../database/schema.js';

/** A Request Category as the API shows it. */
export interface RequestCategory {
  id: string;
  name: string;
  /** The middle of its References, such as `PLUMB`. */
  code: string;
}

/** The six Request Categories: reference data, inserted by a migration. */
@Injectable()
export class RequestCategories {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /** In their display order, Other last. */
  list(): Promise<RequestCategory[]> {
    return this.db
      .select({
        id: requestCategories.id,
        name: requestCategories.name,
        code: requestCategories.code,
      })
      .from(requestCategories)
      .orderBy(asc(requestCategories.sortOrder));
  }
}
