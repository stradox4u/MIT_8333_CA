import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import { type ActivityAction, activityLog, users } from '../database/schema.js';
import { displayName } from './display-name.js';

const actors = alias(users, 'actor');
const targets = alias(users, 'target');

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
        actor: { id: actors.id, name: displayName(actors) },
        target: { id: targets.id, name: displayName(targets) },
      })
      .from(activityLog)
      .innerJoin(actors, eq(actors.id, activityLog.actorId))
      .innerJoin(targets, eq(targets.id, activityLog.targetId))
      .orderBy(desc(activityLog.occurredAt), desc(activityLog.id));
  }
}
