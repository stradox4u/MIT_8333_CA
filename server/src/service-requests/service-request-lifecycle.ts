import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import {
  type AssignmentEndReason,
  assignments,
  OPEN_STATUSES,
  requestCategories,
  serviceRequests,
  type ServiceRequestStatus,
  statusUpdates,
  users,
} from '../database/schema.js';
import { activeWithRole } from '../users/active-users.js';
import {
  type NotAnActiveOfficer,
  type NotFound,
  type UnknownCategory,
  type WrongStatus,
  wrongStatus,
} from './refusals.js';

/** What a Requester gives when they submit a Service Request. */
export interface NewServiceRequest {
  requesterId: string;
  title: string;
  categoryId: string;
  location: string;
  description: string;
}

/** A Service Request locked for a change, with its current Assignment. */
interface Locked {
  id: string;
  status: ServiceRequestStatus;
  assignment: { id: number; officerId: string } | null;
}

/** The Statuses in which an officer holds the work: an Assignment can end. */
const HELD: ServiceRequestStatus[] = ['assigned', 'in_progress'];

/**
 * Every change to a Service Request's Status or Assignment, following the
 * lifecycle in docs/service-requests.md. Each change is one transaction that
 * locks the request first, so the checks and the change can't be overtaken.
 */
@Injectable()
export class ServiceRequestLifecycle {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /**
   * Submits a Service Request, with its Request Category's next Reference,
   * and records the move to Submitted, by the Requester. Taking the number
   * and inserting the request are one transaction, so a number is never
   * used twice or skipped.
   */
  async submit(
    request: NewServiceRequest,
  ): Promise<{ reference: string } | UnknownCategory> {
    return this.db.transaction(async (tx) => {
      // UPDATE … RETURNING takes a row lock on the category until this
      // transaction ends. A simultaneous submission in the same category
      // waits on that lock, then increments the committed number, so no two
      // submissions get the same one.
      const [category] = await tx
        .update(requestCategories)
        .set({ lastNumber: sql`${requestCategories.lastNumber} + 1` })
        .where(eq(requestCategories.id, request.categoryId))
        .returning({
          code: requestCategories.code,
          number: requestCategories.lastNumber,
        });
      if (!category) {
        return 'unknown_category';
      }
      const reference = `SR-${category.code}-${category.number}`;
      const now = this.now();
      const [submitted] = await tx
        .insert(serviceRequests)
        .values({
          ...request,
          reference,
          status: 'submitted',
          submittedAt: now,
        })
        .returning({ id: serviceRequests.id });
      await tx.insert(statusUpdates).values({
        serviceRequestId: submitted.id,
        actorId: request.requesterId,
        fromStatus: null,
        toStatus: 'submitted',
        occurredAt: now,
      });
      return { reference };
    });
  }

  /**
   * Gives an Open request to an active Maintenance Officer: assigning a
   * Submitted one, or reassigning one that's Assigned or In Progress. Either
   * way it's then Assigned, because the officer hasn't started. Giving it
   * to the officer who already holds it changes nothing.
   */
  async assign(
    reference: string,
    officerId: string,
    actorId: string,
  ): Promise<
    'assigned' | 'unchanged' | NotFound | NotAnActiveOfficer | WrongStatus
  > {
    return this.db.transaction(async (tx) => {
      // The officer before the request, the order removing an officer takes
      // them in, so the two never deadlock. Sharing the officer's row keeps
      // them from being removed until this Assignment is in place.
      const [officer] = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.id, officerId), activeWithRole('maintenance_officer')),
        )
        .for('share');
      const request = await this.lock(tx, reference);
      if (!request) {
        return 'not_found';
      }
      if (!OPEN_STATUSES.includes(request.status)) {
        return wrongStatus(request.status);
      }
      if (!officer) {
        return 'not_an_active_officer';
      }
      if (request.assignment?.officerId === officerId) {
        return 'unchanged';
      }
      const now = this.now();
      if (request.assignment) {
        await this.endAssignment(
          tx,
          request.assignment.id,
          'reassigned',
          actorId,
          now,
        );
      }
      const [assignment] = await tx
        .insert(assignments)
        .values({
          serviceRequestId: request.id,
          officerId,
          assignedById: actorId,
          assignedAt: now,
        })
        .returning({ id: assignments.id });
      await this.moveTo(tx, request, 'assigned', {
        actorId,
        at: now,
        assignmentId: assignment.id,
      });
      return 'assigned';
    });
  }

  /** Takes an Assigned or In Progress request back to Submitted. */
  async unassign(
    reference: string,
    actorId: string,
  ): Promise<'unassigned' | NotFound | WrongStatus> {
    return this.db.transaction(async (tx) => {
      const request = await this.lock(tx, reference);
      if (!request) {
        return 'not_found';
      }
      if (!request.assignment || !HELD.includes(request.status)) {
        return wrongStatus(request.status);
      }
      const now = this.now();
      await this.endAssignment(
        tx,
        request.assignment.id,
        'unassigned',
        actorId,
        now,
      );
      await this.moveTo(tx, request, 'submitted', {
        actorId,
        at: now,
        assignmentId: request.assignment.id,
      });
      return 'unassigned';
    });
  }

  /** Locks a request for a change, and reads its current Assignment. */
  private async lock(db: Database, reference: string): Promise<Locked | null> {
    const [request] = await db
      .select({ id: serviceRequests.id, status: serviceRequests.status })
      .from(serviceRequests)
      .where(eq(serviceRequests.reference, reference))
      .for('update');
    if (!request) {
      return null;
    }
    const [assignment] = await db
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

  private async endAssignment(
    db: Database,
    assignmentId: number,
    endReason: AssignmentEndReason,
    actorId: string,
    at: Date,
  ) {
    await db
      .update(assignments)
      .set({ endedAt: at, endedById: actorId, endReason })
      .where(eq(assignments.id, assignmentId));
  }

  /** Moves a request to a Status, recording the Status Update. */
  private async moveTo(
    db: Database,
    request: Locked,
    to: ServiceRequestStatus,
    change: { actorId: string; at: Date; assignmentId?: number },
  ) {
    if (request.status === to) {
      return;
    }
    await db
      .update(serviceRequests)
      .set({ status: to })
      .where(eq(serviceRequests.id, request.id));
    await db.insert(statusUpdates).values({
      serviceRequestId: request.id,
      actorId: change.actorId,
      fromStatus: request.status,
      toStatus: to,
      assignmentId: change.assignmentId,
      occurredAt: change.at,
    });
  }

  private now() {
    return new Date(this.clock.now());
  }
}
