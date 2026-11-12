import { Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import { type ActivityAction, activityLog, users } from '../database/schema.js';

const actors = alias(users, 'actor');
const targets = alias(users, 'target');

/** "First Last", or "Erased user" once erased: names are read at display time. */
const nameOf = (person: typeof actors | typeof targets) =>
  sql<string>`case when ${person.erasedAt} is not null then 'Erased user'
                   else ${person.firstName} || ' ' || ${person.lastName} end`;

/**
 * The Activity Log (GLOSSARY.md): who did what to which User, and when.
 * Entries are never changed or removed.
 */
@Injectable()
export class ActivityLog {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async record(entry: {
    actorId: string;
    targetId: string;
    action: ActivityAction;
    details?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(activityLog).values({
      ...entry,
      details: entry.details ?? null,
      occurredAt: new Date(this.clock.now()),
    });
  }

  /** Newest first. */
  list() {
    return this.db
      .select({
        id: activityLog.id,
        occurredAt: activityLog.occurredAt,
        action: activityLog.action,
        details: activityLog.details,
        actor: { id: actors.id, name: nameOf(actors) },
        target: { id: targets.id, name: nameOf(targets) },
      })
      .from(activityLog)
      .innerJoin(actors, eq(actors.id, activityLog.actorId))
      .innerJoin(targets, eq(targets.id, activityLog.targetId))
      .orderBy(desc(activityLog.occurredAt), desc(activityLog.id));
  }
}
