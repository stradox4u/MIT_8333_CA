import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import {
  type ActivityAction,
  type AssignmentEndReason,
  assignments,
  OPEN_STATUSES,
  progressNotes,
  type Priority,
  requestCategories,
  serviceRequests,
  type ServiceRequestStatus,
  statusUpdates,
  users,
} from '../database/schema.js';
import { recordActivity } from '../users/activity-log.js';
import { activeWithRole } from '../users/active-users.js';
import type {
  AfterCommit,
  OfficerDepartures,
} from '../users/officer-departures.js';
import {
  type NotAnActiveOfficer,
  type NotAllowed,
  type NotCurrentOfficer,
  type NotFound,
  type UnknownCategory,
  type WrongStatus,
  wrongStatus,
} from './refusals.js';
import {
  type ServiceRequestChange,
  ServiceRequestNotifications,
} from './service-request-notifications.js';

/** What a Requester gives when they submit a Service Request. */
export interface NewServiceRequest {
  requesterId: string;
  title: string;
  categoryId: string;
  location: string;
  description: string;
}

export type DetailsEdits = Partial<Omit<NewServiceRequest, 'requesterId'>>;

/** A Service Request locked for a change, with its current Assignment. */
interface Locked {
  id: string;
  reference: string;
  requesterId: string;
  status: ServiceRequestStatus;
  completedAt: Date | null;
  priority: Priority;
  assignment: { id: number; officerId: string } | null;
}

/** The Status Update an action made, as the Activity Log records it. */
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
export class ServiceRequestLifecycle implements OfficerDepartures {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly clock: Clock,
    @Inject(ServiceRequestNotifications)
    private readonly notifications: Pick<ServiceRequestNotifications, 'send'>,
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
    return this.change(async (tx, changed) => {
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
      changed.push({
        reference,
        requesterId: request.requesterId,
        actorId: request.requesterId,
        moved: { from: null, to: 'submitted' },
      });
      return { reference };
    });
  }

  /**
   * Assigns Open work to an active officer, returning it to Assigned so the
   * new officer can start. Assigning its current officer changes nothing.
   */
  async assign(
    reference: string,
    officerId: string,
    actorId: string,
  ): Promise<
    'assigned' | 'unchanged' | NotFound | NotAnActiveOfficer | WrongStatus
  > {
    return this.change(async (tx, changed) => {
      const officer = await this.lockActiveOfficer(tx, officerId);
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
      changed.push(
        this.news(request, actorId, moved, {
          assignedTo: officerId,
          ...(previous && {
            ended: { officerId: previous.officerId, why: 'reassigned' },
          }),
        }),
      );
      return 'assigned';
    });
  }

  /** Takes an Assigned or In Progress request back to Submitted. */
  async unassign(
    reference: string,
    actorId: string,
  ): Promise<'unassigned' | NotFound | WrongStatus> {
    return this.change(async (tx, changed) => {
      const request = await this.lock(tx, reference);
      if (!request) {
        return 'not_found';
      }
      if (!request.assignment || !HELD.includes(request.status)) {
        return wrongStatus(request.status);
      }
      changed.push(
        await this.handBack(
          tx,
          request,
          request.assignment,
          'unassigned',
          actorId,
        ),
      );
      return 'unassigned';
    });
  }

  /** The current officer starts the work: Assigned to In Progress. */
  async start(
    reference: string,
    officerId: string,
  ): Promise<'started' | NotFound | NotCurrentOfficer | WrongStatus> {
    return this.change(async (tx, changed) => {
      const officer = await this.lockActiveOfficer(tx, officerId);
      const request = await this.lock(tx, reference);
      if (!request) {
        return 'not_found';
      }
      if (!officer || request.assignment?.officerId !== officerId) {
        return 'not_current_officer';
      }
      if (request.status !== 'assigned') {
        return wrongStatus(request.status);
      }
      changed.push(
        await this.changeStatus(tx, request, 'in_progress', officerId),
      );
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
    return this.change(async (tx, changed) => {
      const officer = await this.lockActiveOfficer(tx, officerId);
      const request = await this.lock(tx, reference);
      if (!request) {
        return 'not_found';
      }
      if (!officer || request.assignment?.officerId !== officerId) {
        return 'not_current_officer';
      }
      if (request.status !== 'in_progress') {
        return wrongStatus(request.status);
      }
      changed.push(
        await this.changeStatus(tx, request, 'completed', officerId, { note }),
      );
      return 'completed';
    });
  }

  /** Confirms Completed work while preserving the officer's Assignment. */
  async verify(
    reference: string,
    actorId: string,
  ): Promise<'verified' | NotFound | NotAllowed | WrongStatus> {
    return this.change(async (tx, changed) => {
      const actor = await this.lockActor(tx, actorId);
      const request = await this.lock(tx, reference);
      if (!request) return 'not_found';
      if (
        !actor ||
        (actor.roleId !== 'administrator' && request.requesterId !== actorId)
      )
        return 'not_allowed';
      if (request.status !== 'completed') return wrongStatus(request.status);
      changed.push(await this.changeStatus(tx, request, 'verified', actorId));
      return 'verified';
    });
  }

  /** Rechecks each deadline under its request lock so answers can safely race the job. */
  async verifyOverdue(): Promise<number> {
    const cutoff = new Date(this.clock.now() - 7 * 24 * 60 * 60 * 1000);
    const due = await this.db
      .select({ reference: serviceRequests.reference })
      .from(serviceRequests)
      .where(
        and(
          eq(serviceRequests.status, 'completed'),
          lte(serviceRequests.completedAt, cutoff),
        ),
      )
      .orderBy(asc(serviceRequests.id));
    let verified = 0;
    for (const { reference } of due) {
      const overdue = await this.change(async (tx, changed) => {
        const request = await this.lock(tx, reference);
        if (
          !request ||
          request.status !== 'completed' ||
          !request.completedAt ||
          request.completedAt > cutoff
        )
          return false;
        changed.push(await this.changeStatus(tx, request, 'verified', null));
        return true;
      });
      if (overdue) verified++;
    }
    return verified;
  }

  /** Records the Requester's reason for returning Completed work to its officer. */
  async notFixed(
    reference: string,
    actorId: string,
    reason: string,
  ): Promise<'returned' | NotFound | NotAllowed | WrongStatus> {
    return this.change(async (tx, changed) => {
      const actor = await this.lockActor(tx, actorId);
      const request = await this.lock(tx, reference);
      if (!request) return 'not_found';
      if (!actor || request.requesterId !== actorId) return 'not_allowed';
      if (request.status !== 'completed') return wrongStatus(request.status);
      const [officer] = request.assignment
        ? await tx
            .select({ id: users.id })
            .from(users)
            .where(
              and(
                eq(users.id, request.assignment.officerId),
                activeWithRole('maintenance_officer'),
              ),
            )
        : [];
      if (!officer && request.assignment) {
        await this.endAssignment(
          tx,
          request.assignment.id,
          'not_fixed',
          actorId,
          this.now(),
        );
      }
      changed.push({
        ...(await this.changeStatus(
          tx,
          request,
          officer ? 'assigned' : 'submitted',
          actorId,
          { reason },
        )),
        ...(officer && { returnedTo: officer.id }),
      });
      return 'returned';
    });
  }

  /** Cancels work atomically with its Assignment ending and the actor's reason. */
  async cancel(
    reference: string,
    actorId: string,
    reason: string,
  ): Promise<'cancelled' | NotFound | NotAllowed | WrongStatus> {
    return this.change(async (tx, changed) => {
      const actor = await this.lockActor(tx, actorId);
      const request = await this.lock(tx, reference);
      if (!request) return 'not_found';
      if (
        !actor ||
        (actor.roleId !== 'administrator' && request.requesterId !== actorId)
      )
        return 'not_allowed';
      if (
        !OPEN_STATUSES.includes(request.status) ||
        (actor.roleId !== 'administrator' && request.status !== 'submitted')
      )
        return wrongStatus(request.status);
      if (request.assignment)
        await this.endAssignment(
          tx,
          request.assignment.id,
          'cancelled',
          actorId,
          this.now(),
        );
      changed.push({
        ...(await this.changeStatus(tx, request, 'cancelled', actorId, {
          reason,
        })),
        ...(request.assignment && {
          ended: { officerId: request.assignment.officerId, why: 'cancelled' },
        }),
      });
      return 'cancelled';
    });
  }

  /** Records only changed fields, keeping corrections off the Status timeline. */
  async edit(
    reference: string,
    actorId: string,
    edits: DetailsEdits,
  ): Promise<
    | 'edited'
    | 'unchanged'
    | NotFound
    | NotAllowed
    | WrongStatus
    | UnknownCategory
  > {
    return this.db.transaction(async (tx) => {
      const actor = await this.lockActor(tx, actorId);
      const request = await this.lock(tx, reference);
      if (!request) return 'not_found';
      if (
        !actor ||
        (actor.roleId !== 'administrator' && request.requesterId !== actorId)
      )
        return 'not_allowed';
      if (
        !OPEN_STATUSES.includes(request.status) ||
        (actor.roleId !== 'administrator' && request.status !== 'submitted')
      )
        return wrongStatus(request.status);
      const fullEdit =
        request.requesterId === actorId && request.status === 'submitted';
      if (
        !fullEdit &&
        (edits.title !== undefined || edits.description !== undefined)
      )
        return 'not_allowed';
      if (edits.categoryId !== undefined) {
        const [category] = await tx
          .select({ id: requestCategories.id })
          .from(requestCategories)
          .where(eq(requestCategories.id, edits.categoryId));
        if (!category) return 'unknown_category';
      }
      const [before] = await tx
        .select({
          title: serviceRequests.title,
          categoryId: serviceRequests.categoryId,
          location: serviceRequests.location,
          description: serviceRequests.description,
        })
        .from(serviceRequests)
        .where(eq(serviceRequests.id, request.id));
      const changes: Record<string, { from: string; to: string }> = {};
      for (const field of Object.keys(edits) as (keyof DetailsEdits)[]) {
        const value = edits[field];
        if (value !== undefined && value !== before[field])
          changes[field] = { from: before[field], to: value };
      }
      if (Object.keys(changes).length === 0) return 'unchanged';
      await tx
        .update(serviceRequests)
        .set(edits)
        .where(eq(serviceRequests.id, request.id));
      await this.record(tx, request.id, this.now(), {
        actorId,
        action: 'details_changed',
        details: { changes },
      });
      return 'edited';
    });
  }

  /** Rechecks author rights and Status under the same locks as lifecycle changes. */
  async addProgressNote(
    reference: string,
    actorId: string,
    text: string,
  ): Promise<'added' | NotFound | NotAllowed | WrongStatus> {
    return this.db.transaction(async (tx) => {
      const actor = await this.lockActor(tx, actorId);
      const request = await this.lock(tx, reference);
      if (!request) return 'not_found';
      if (
        !actor ||
        !(
          actor.roleId === 'administrator' ||
          request.requesterId === actorId ||
          (actor.roleId === 'maintenance_officer' &&
            request.assignment?.officerId === actorId)
        )
      )
        return 'not_allowed';
      if (
        !OPEN_STATUSES.includes(request.status) &&
        request.status !== 'completed'
      )
        return wrongStatus(request.status);
      await tx.insert(progressNotes).values({
        serviceRequestId: request.id,
        authorId: actorId,
        text,
        createdAt: this.now(),
      });
      return 'added';
    });
  }

  /** Changes Priority only on Open work, recording no entry for an unchanged value. */
  async setPriority(
    reference: string,
    actorId: string,
    priority: Priority,
  ): Promise<'changed' | 'unchanged' | NotFound | NotAllowed | WrongStatus> {
    return this.db.transaction(async (tx) => {
      const actor = await this.lockActor(tx, actorId);
      const request = await this.lock(tx, reference);
      if (!request) return 'not_found';
      if (actor?.roleId !== 'administrator') return 'not_allowed';
      if (!OPEN_STATUSES.includes(request.status))
        return wrongStatus(request.status);
      if (request.priority === priority) return 'unchanged';
      await tx
        .update(serviceRequests)
        .set({ priority })
        .where(eq(serviceRequests.id, request.id));
      await this.record(tx, request.id, this.now(), {
        actorId,
        action: 'priority_changed',
        details: { from: request.priority, to: priority },
      });
      return 'changed';
    });
  }

  /**
   * An officer is leaving (`OfficerDepartures`): each request they hold
   * that's Assigned or In Progress goes back to Submitted, in `db`, the
   * transaction changing the User. That transaction has already locked the
   * officer's row; the requests come second, as when assigning. Answers
   * the emails to send once it commits.
   */
  async handBackAssignmentsOf(
    db: Database,
    officerId: string,
    actorId: string,
  ): Promise<AfterCommit> {
    const changed: ServiceRequestChange[] = [];
    const candidates = await db
      .select({
        reference: serviceRequests.reference,
      })
      .from(assignments)
      .innerJoin(
        serviceRequests,
        eq(serviceRequests.id, assignments.serviceRequestId),
      )
      .where(
        and(eq(assignments.officerId, officerId), isNull(assignments.endedAt)),
      )
      .orderBy(asc(assignments.id));
    for (const { reference } of candidates) {
      // Completed work can reopen concurrently, so filter Status after locking.
      // Re-read its Assignment in case reassignment committed during the wait.
      const request = await this.lock(db, reference);
      if (
        !request ||
        !HELD.includes(request.status) ||
        request.assignment?.officerId !== officerId
      ) {
        continue;
      }
      changed.push(
        await this.handBack(
          db,
          request,
          request.assignment,
          'officer_left',
          actorId,
        ),
      );
    }
    return () => this.notifications.send(changed);
  }

  /**
   * Runs a change in one transaction, collecting what it changed, and emails
   * about it only once that commits. A rolled-back change sends nothing.
   */
  private async change<T>(
    work: (tx: Database, changed: ServiceRequestChange[]) => Promise<T>,
  ): Promise<T> {
    const changed: ServiceRequestChange[] = [];
    const outcome = await this.db.transaction((tx) => work(tx, changed));
    await this.notifications.send(changed);
    return outcome;
  }

  /** Locks the officer first so actor foreign keys cannot reverse departure's lock order. */
  private async lockActiveOfficer(
    db: Database,
    officerId: string,
  ): Promise<boolean> {
    const [officer] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.id, officerId), activeWithRole('maintenance_officer')),
      )
      .for('share');
    return officer !== undefined;
  }

  /** Locks the actor before the request, including later foreign-key checks. */
  private async lockActor(db: Database, actorId: string) {
    const [actor] = await db
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

  /** Locks a request for a change, and reads its current Assignment. */
  private async lock(db: Database, reference: string): Promise<Locked | null> {
    const [request] = await db
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

  /** A Status Update on its own, such as starting or completing the work. */
  private async changeStatus(
    db: Database,
    request: Locked,
    to: ServiceRequestStatus,
    actorId: string | null,
    details: { note?: string | null; reason?: string | null } = {},
  ): Promise<ServiceRequestChange> {
    const at = this.now();
    const moved = await this.moveTo(db, request, to, {
      actorId,
      at,
      ...details,
    });
    await this.record(db, request.id, at, {
      actorId,
      action: 'status_changed',
      details: moved,
    });
    return this.news(request, actorId, moved && { ...moved, ...details });
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
  ): Promise<ServiceRequestChange> {
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
    return this.news(request, actorId, moved, {
      ended: { officerId: assignment.officerId, why: reason },
    });
  }

  private async endAssignment(
    db: Database,
    assignmentId: number,
    endReason: AssignmentEndReason,
    actorId: string,
    at: Date,
  ) {
    const ended = await db
      .update(assignments)
      .set({ endedAt: at, endedById: actorId, endReason })
      .where(and(eq(assignments.id, assignmentId), isNull(assignments.endedAt)))
      .returning({ id: assignments.id });
    if (ended.length !== 1) {
      throw new Error(
        'The current Assignment ended while its request was locked',
      );
    }
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
      actorId: string | null;
      at: Date;
      assignmentId?: number;
      note?: string | null;
      reason?: string | null;
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
        ...(to === 'verified' && { verifiedAt: change.at }),
        ...(to === 'cancelled' && { cancelledAt: change.at }),
        ...(request.status === 'completed' &&
          (to === 'assigned' || to === 'submitted') && { completedAt: null }),
      })
      .where(eq(serviceRequests.id, request.id));
    await db.insert(statusUpdates).values({
      serviceRequestId: request.id,
      actorId: change.actorId,
      fromStatus: request.status,
      toStatus: to,
      assignmentId: change.assignmentId,
      note: change.note,
      reason: change.reason,
      occurredAt: change.at,
    });
    return { from: request.status, to };
  }

  /** What a change did to `request`, for its emails once it commits. */
  private news(
    request: Locked,
    actorId: string | null,
    moved: ServiceRequestChange['moved'],
    assignments: Pick<ServiceRequestChange, 'assignedTo' | 'ended'> = {},
  ): ServiceRequestChange {
    return {
      reference: request.reference,
      requesterId: request.requesterId,
      actorId,
      ...(moved && { moved }),
      ...assignments,
    };
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
