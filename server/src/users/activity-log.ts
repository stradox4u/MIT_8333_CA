import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import {
  type ActivityAction,
  activityLog,
  serviceRequests,
  users,
} from '../database/schema.js';
import { displayName } from './display-name.js';

const actors = alias(users, 'actor');
const targets = alias(users, 'target');

/** One entry: who did what, to exactly one User or Service Request. */
export type ActivityEntry = {
  /** `null` when nobody acted: an automatic change. */
  actorId: string | null;
  action: ActivityAction;
  details?: Record<string, unknown>;
} & (
  | { targetId: string; serviceRequestId?: never }
  | { serviceRequestId: string; targetId?: never }
);

/**
 * Writes an Activity Log entry through `db`, so a change can record itself
 * in its own transaction.
 */
export async function recordActivity(
  db: Database,
  entry: ActivityEntry,
  occurredAt: Date,
): Promise<void> {
  await db.insert(activityLog).values({
    actorId: entry.actorId,
    targetId: entry.targetId ?? null,
    serviceRequestId: entry.serviceRequestId ?? null,
    action: entry.action,
    details: entry.details ?? null,
    occurredAt,
  });
}

/**
 * The Activity Log (GLOSSARY.md): who did what to which User or Service
 * Request, and when. Entries are never changed or removed.
 */
@Injectable()
export class ActivityLog {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async record(entry: ActivityEntry): Promise<void> {
    await recordActivity(this.db, entry, new Date(this.clock.now()));
  }

  /** Newest first. */
  async list() {
    const entries = await this.db
      .select({
        id: activityLog.id,
        occurredAt: activityLog.occurredAt,
        action: activityLog.action,
        details: activityLog.details,
        actorId: actors.id,
        actorName: displayName(actors),
        targetId: targets.id,
        targetName: displayName(targets),
        reference: serviceRequests.reference,
      })
      .from(activityLog)
      .leftJoin(actors, eq(actors.id, activityLog.actorId))
      .leftJoin(targets, eq(targets.id, activityLog.targetId))
      .leftJoin(
        serviceRequests,
        eq(serviceRequests.id, activityLog.serviceRequestId),
      )
      .orderBy(desc(activityLog.occurredAt), desc(activityLog.id));
    return entries.map(
      ({ actorId, actorName, targetId, targetName, reference, ...entry }) => ({
        ...entry,
        actor: actorId ? { id: actorId, name: actorName } : null,
        target: targetId ? { id: targetId, name: targetName } : null,
        serviceRequest: reference ? { reference } : null,
      }),
    );
  }
}
