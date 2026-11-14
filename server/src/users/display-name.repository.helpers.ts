import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

interface Person {
  firstName: AnyPgColumn;
  lastName: AnyPgColumn;
  erasedAt: AnyPgColumn;
}

/**
 * The one rule for showing a User's name: "First Last", or "Erased user"
 * once erased (ADR-0002). In SQL, so lists and the Activity Log read it the
 * same way.
 */
export const displayName = (person: Person) =>
  sql<string>`case when ${person.erasedAt} is not null then 'Erased user'
                   else ${person.firstName} || ' ' || ${person.lastName} end`;
