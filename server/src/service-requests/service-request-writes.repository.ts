import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { InjectDatabase, type Database } from '../database/database.js';
import { transactionConnection } from '../database/transaction.repository.js';
import type { RepositoryTransaction } from '../persistence/transaction.js';
import {
  assignments,
  progressNotes,
  requestCategories,
  serviceRequests,
  statusUpdates,
  users,
} from '../database/schema.js';
import { activeWithRole } from '../users/active-users.repository.helpers.js';
import {
  recordActivity,
  type ActivityEntry,
} from '../users/activity-log.repository.js';
import type { RoleId } from '../users/user.types.js';
import type {
  AssignmentEndReason,
  DetailsEdits,
  LockedServiceRequest,
  NewServiceRequest,
  Priority,
  ServiceRequestStatus,
} from './service-request.types.js';

/** Atomic persistence operations; callers never receive a connection or query builder. */
@Injectable()
export class ServiceRequestWritesRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  transaction<T>(
    work: (store: ServiceRequestWritesRepository) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((tx) =>
      work(new ServiceRequestWritesRepository(tx)),
    );
  }

  within(scope: RepositoryTransaction): ServiceRequestWritesRepository {
    return new ServiceRequestWritesRepository(transactionConnection(scope));
  }

  async submit(
    request: NewServiceRequest,
    at: Date,
  ): Promise<{ reference: string } | 'unknown_category'> {
    const [category] = await this.db
      .update(requestCategories)
      .set({ lastNumber: sql`${requestCategories.lastNumber} + 1` })
      .where(eq(requestCategories.id, request.categoryId))
      .returning({
        code: requestCategories.code,
        number: requestCategories.lastNumber,
      });
    if (!category) return 'unknown_category';
    const reference = `SR-${category.code}-${category.number}`;
    const [created] = await this.db
      .insert(serviceRequests)
      .values({ ...request, reference, status: 'submitted', submittedAt: at })
      .returning({ id: serviceRequests.id });
    await this.db
      .insert(statusUpdates)
      .values({
        serviceRequestId: created.id,
        actorId: request.requesterId,
        fromStatus: null,
        toStatus: 'submitted',
        occurredAt: at,
      });
    await this.record(
      {
        serviceRequestId: created.id,
        actorId: request.requesterId,
        action: 'status_changed',
        details: { from: null, to: 'submitted' },
      },
      at,
    );
    return { reference };
  }

  async createAssignment(
    serviceRequestId: string,
    officerId: string,
    actorId: string,
    at: Date,
  ): Promise<{ id: number }> {
    const [assignment] = await this.db
      .insert(assignments)
      .values({
        serviceRequestId,
        officerId,
        assignedById: actorId,
        assignedAt: at,
      })
      .returning({ id: assignments.id });
    return assignment;
  }

  overdue(cutoff: Date): Promise<{ reference: string }[]> {
    return this.db
      .select({ reference: serviceRequests.reference })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.status, 'completed'),
          lte(serviceRequests.completedAt, cutoff),
        ),
      )
      .orderBy(asc(serviceRequests.id));
  }

  async activeOfficer(officerId: string): Promise<{ id: string } | undefined> {
    const [officer] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.id, officerId), activeWithRole('maintenance_officer')),
      );
    return officer;
  }

  async lockActiveOfficer(officerId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.id, officerId), activeWithRole('maintenance_officer')),
      )
      .for('share');
    return rows.length !== 0;
  }

  async lockActor(
    actorId: string,
  ): Promise<{ id: string; roleId: RoleId | null } | undefined> {
    const [actor] = await this.db
      .select({ id: users.id, roleId: users.roleId })
      .from(users)
      .where(
        and(
          eq(users.id, actorId),
          isNotNull(users.roleId),
          isNotNull(users.emailVerifiedAt),
          isNull(users.deactivatedAt),
          isNull(users.erasedAt),
        ),
      )
      .for('share');
    return actor;
  }

  async lock(reference: string): Promise<LockedServiceRequest | null> {
    const [request] = await this.db
      .select({
        id: serviceRequests.id,
        reference: serviceRequests.reference,
        requesterId: serviceRequests.requesterId,
        status: serviceRequests.status,
        completedAt: serviceRequests.completedAt,
        priority: serviceRequests.priority,
      })
      .from(serviceRequests)
      .where(eq(serviceRequests.reference, reference))
      .for('update');
    if (!request) return null;
    const [assignment] = await this.db
      .select({ id: assignments.id, officerId: assignments.officerId })
      .from(assignments)
      .where(
        and(
          eq(assignments.serviceRequestId, request.id),
          isNull(assignments.endedAt),
        ),
      );
    return { ...request, assignment: assignment ?? null };
  }

  async hasCategory(categoryId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: requestCategories.id })
      .from(requestCategories)
      .where(eq(requestCategories.id, categoryId));
    return rows.length !== 0;
  }

  async details(id: string): Promise<Required<DetailsEdits>> {
    const [row] = await this.db
      .select({
        title: serviceRequests.title,
        categoryId: serviceRequests.categoryId,
        location: serviceRequests.location,
        description: serviceRequests.description,
      })
      .from(serviceRequests)
      .where(eq(serviceRequests.id, id));
    return row;
  }

  async editDetails(id: string, edits: DetailsEdits): Promise<void> {
    await this.db
      .update(serviceRequests)
      .set(edits)
      .where(eq(serviceRequests.id, id));
  }

  async addProgressNote(
    id: string,
    actorId: string,
    text: string,
    at: Date,
  ): Promise<void> {
    await this.db
      .insert(progressNotes)
      .values({ serviceRequestId: id, authorId: actorId, text, createdAt: at });
  }

  async setPriority(id: string, priority: Priority): Promise<void> {
    await this.db
      .update(serviceRequests)
      .set({ priority })
      .where(eq(serviceRequests.id, id));
  }

  heldReferences(officerId: string): Promise<{ reference: string }[]> {
    return this.db
      .select({ reference: serviceRequests.reference })
      .from(assignments)
      .innerJoin(
        serviceRequests,
        eq(serviceRequests.id, assignments.serviceRequestId),
      )
      .where(
        and(eq(assignments.officerId, officerId), isNull(assignments.endedAt)),
      )
      .orderBy(asc(assignments.id));
  }

  async endAssignment(
    id: number,
    endReason: AssignmentEndReason,
    actorId: string,
    at: Date,
  ): Promise<void> {
    const ended = await this.db
      .update(assignments)
      .set({ endedAt: at, endedById: actorId, endReason })
      .where(and(eq(assignments.id, id), isNull(assignments.endedAt)))
      .returning({ id: assignments.id });
    if (ended.length !== 1)
      throw new Error(
        'The current Assignment ended while its request was locked',
      );
  }

  async recordStatusChange(
    id: string,
    from: ServiceRequestStatus,
    to: ServiceRequestStatus,
    change: {
      actorId: string | null;
      at: Date;
      assignmentId?: number;
      note?: string | null;
      reason?: string | null;
    },
  ): Promise<void> {
    await this.db
      .update(serviceRequests)
      .set({
        status: to,
        ...(to === 'completed' && { completedAt: change.at }),
        ...(to === 'verified' && { verifiedAt: change.at }),
        ...(to === 'cancelled' && { cancelledAt: change.at }),
        ...(from === 'completed' &&
          (to === 'assigned' || to === 'submitted') && { completedAt: null }),
      })
      .where(eq(serviceRequests.id, id));
    await this.db
      .insert(statusUpdates)
      .values({
        serviceRequestId: id,
        actorId: change.actorId,
        fromStatus: from,
        toStatus: to,
        assignmentId: change.assignmentId,
        note: change.note,
        reason: change.reason,
        occurredAt: change.at,
      });
  }

  record(entry: ActivityEntry, at: Date): Promise<void> {
    return recordActivity(this.db, entry, at);
  }

  /** The owner lock protects the seed slot across concurrent and nested lifecycle work. */
  async seedSlot(
    requesterId: string,
    status: ServiceRequestStatus,
    work: (store: ServiceRequestWritesRepository, key: string) => Promise<void>,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, requesterId))
        .for('update');
      const key = `${requesterId}:${status}`;
      const existing = await tx
        .select({ id: serviceRequests.id })
        .from(serviceRequests)
        .where(eq(serviceRequests.demoKey, key));
      if (!existing.length)
        await work(new ServiceRequestWritesRepository(tx), key);
    });
  }

  async markDemo(reference: string, key: string): Promise<void> {
    await this.db
      .update(serviceRequests)
      .set({ demoKey: key })
      .where(eq(serviceRequests.reference, reference));
  }
}
