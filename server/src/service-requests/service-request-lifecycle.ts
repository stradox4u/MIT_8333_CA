import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import {
  type ActivityAction,
  type AssignmentEndReason,
  assignments,
  OPEN_STATUSES,
  requestCategories,
  serviceRequests,
  type ServiceRequestStatus,
  statusUpdates,
  users,
} from '../database/schema.js';
import { recordActivity } from '../users/activity-log.js';
import { activeWithRole } from '../users/active-users.js';
import {
  type NotAnActiveOfficer,
  type NotCurrentOfficer,
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

/** The Status change an action made, as the Activity Log records it. */
type Moved = { from: ServiceRequestStatus | null; to: ServiceRequestStatus };

/** The Statuses in which an officer holds the work: an Assignment can end. */
const HELD: ServiceRequestStatus[] = ['assigned', 'in_progress'];

/**
 * Every change to a Service Request's Status or Assignment, following the
 * lifecycle in docs/service-requests.md. Each change is one transaction that
 * locks the request first, so the checks and the change can't be overtaken,
 * and writes its Activity Log entry in that same transaction.
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
      await this.record(tx, submitted.id, now, {
        actorId: request.requesterId,
        action: 'status_changed',
        details: { from: null, to: 'submitted' },
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
      const previous = request.assignment;
      if (previous?.officerId === officerId) {
        return 'unchanged';
      }
      const now = this.now();
      if (previous) {
        await this.endAssignment(tx, previous.id, 'reassigned', actorId, now);
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
      const moved = await this.moveTo(tx, request, 'assigned', {
        actorId,
        at: now,
        assignmentId: assignment.id,
      });
      await this.record(tx, request.id, now, {
        actorId,
        action: previous ? 'reassigned' : 'assigned',
        details: {
          officerId,
          ...(previous && { previousOfficerId: previous.officerId }),
          ...moved,
        },
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
      await this.handBack(
        tx,
        request,
        request.assignment,
        'unassigned',
        actorId,
      );
      return 'unassigned';
    });
  }

  /** The current officer starts the work: Assigned to In Progress. */
  async start(
    reference: string,
    officerId: string,
  ): Promise<'started' | NotFound | NotCurrentOfficer | WrongStatus> {
    return this.db.transaction(async (tx) => {
      const request = await this.lock(tx, reference);
      if (!request) {
        return 'not_found';
      }
      if (request.assignment?.officerId !== officerId) {
        return 'not_current_officer';
      }
      if (request.status !== 'assigned') {
        return wrongStatus(request.status);
      }
      await this.changeStatus(tx, request, 'in_progress', officerId);
      return 'started';
    });
  }

  /**
   * The current officer finishes the work: In Progress to Completed, with
   * their optional note on that Status Update. They keep the Assignment,
   * as the record of who did the work.
   */
  async complete(
    reference: string,
    officerId: string,
    note: string | null,
  ): Promise<'completed' | NotFound | NotCurrentOfficer | WrongStatus> {
    return this.db.transaction(async (tx) => {
      const request = await this.lock(tx, reference);
      if (!request) {
        return 'not_found';
      }
      if (request.assignment?.officerId !== officerId) {
        return 'not_current_officer';
      }
      if (request.status !== 'in_progress') {
        return wrongStatus(request.status);
      }
      await this.changeStatus(tx, request, 'completed', officerId, note);
      return 'completed';
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

  /** A Status change on its own, such as starting or completing the work. */
  private async changeStatus(
    db: Database,
    request: Locked,
    to: ServiceRequestStatus,
    actorId: string,
    note: string | null = null,
  ) {
    const at = this.now();
    const moved = await this.moveTo(db, request, to, { actorId, at, note });
    await this.record(db, request.id, at, {
      actorId,
      action: 'status_changed',
      details: moved,
    });
  }

  /**
   * Ends a held request's current Assignment and hands it back to
   * Submitted: an Administrator unassigning it, or its officer leaving.
   */
  private async handBack(
    db: Database,
    request: Locked,
    assignment: NonNullable<Locked['assignment']>,
    reason: Extract<AssignmentEndReason, 'unassigned' | 'officer_left'>,
    actorId: string,
  ) {
    const at = this.now();
    await this.endAssignment(db, assignment.id, reason, actorId, at);
    const moved = await this.moveTo(db, request, 'submitted', {
      actorId,
      at,
      assignmentId: assignment.id,
    });
    await this.record(db, request.id, at, {
      actorId,
      action: reason,
      details: { officerId: assignment.officerId, ...moved },
    });
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

  /**
   * Moves a request to a Status, recording the Status Update. Answers the
   * change it made, or nothing when the request was already there.
   */
  private async moveTo(
    db: Database,
    request: Locked,
    to: ServiceRequestStatus,
    change: {
      actorId: string;
      at: Date;
      assignmentId?: number;
      note?: string | null;
    },
  ): Promise<Moved | undefined> {
    if (request.status === to) {
      return undefined;
    }
    await db
      .update(serviceRequests)
      .set({
        status: to,
        ...(to === 'completed' && { completedAt: change.at }),
      })
      .where(eq(serviceRequests.id, request.id));
    await db.insert(statusUpdates).values({
      serviceRequestId: request.id,
      actorId: change.actorId,
      fromStatus: request.status,
      toStatus: to,
      assignmentId: change.assignmentId,
      note: change.note,
      occurredAt: change.at,
    });
    return { from: request.status, to };
  }

  /** The action's Activity Log entry, naming the request. */
  private record(
    db: Database,
    serviceRequestId: string,
    at: Date,
    entry: {
      actorId: string | null;
      action: ActivityAction;
      details?: Record<string, unknown>;
    },
  ) {
    return recordActivity(db, { ...entry, serviceRequestId }, at);
  }

  private now() {
    return new Date(this.clock.now());
  }
}
