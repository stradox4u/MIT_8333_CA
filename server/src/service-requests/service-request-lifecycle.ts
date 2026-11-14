import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Clock } from '../clock.js';
import type { RepositoryTransaction } from '../persistence/transaction.js';
import { ServiceRequestWritesRepository } from './service-request-writes.repository.js';
import {
  OPEN_STATUSES,
  type Priority,
  type ServiceRequestStatus,
  type AssignmentEndReason,
  type NewServiceRequest,
  type DetailsEdits,
  type LockedServiceRequest as Locked,
} from './service-request.types.js';
import type { ActivityAction } from '../users/activity-log.types.js';
export type {
  NewServiceRequest,
  DetailsEdits,
} from './service-request.types.js';
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
  SERVICE_REQUESTS_COMMITTED,
} from './service-request-events.js';

/** The Status Update an action made, as the Activity Log records it. */
type Moved = { from: ServiceRequestStatus | null; to: ServiceRequestStatus };

/** The Statuses in which an officer holds the work: an Assignment can end. */
const HELD: ServiceRequestStatus[] = ['assigned', 'in_progress'];

/**
 * Every change to a Service Request's Status or Assignment, following the
 * lifecycle in docs/service-requests.md. Each change is one transaction that
 * keeps the actor/request lock order, so checks and changes cannot be overtaken,
 * and writes its Activity Log entry in that same transaction.
 */
@Injectable()
export class ServiceRequestLifecycle implements OfficerDepartures {
  constructor(
    private readonly writes: ServiceRequestWritesRepository,
    private readonly clock: Clock,
    private readonly events: EventEmitter2,
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
    return this.change(async (store, changed) => {
      const submitted = await store.submit(request, () => this.now());
      if (typeof submitted === 'string') return submitted;
      const { reference } = submitted;
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
    return this.change(async (store, changed) => {
      const officer = await store.lockActiveOfficer(officerId);
      const request = await store.lock(reference);
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
        await store.endAssignment(previous.id, 'reassigned', actorId, now);
      }
      const assignment = await store.createAssignment(
        request.id,
        officerId,
        actorId,
        now,
      );
      const moved = await this.moveTo(store, request, 'assigned', {
        actorId,
        at: now,
        assignmentId: assignment.id,
      });
      await this.record(store, request.id, now, {
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
    return this.change(async (store, changed) => {
      const request = await store.lock(reference);
      if (!request) {
        return 'not_found';
      }
      if (!request.assignment || !HELD.includes(request.status)) {
        return wrongStatus(request.status);
      }
      changed.push(
        await this.handBack(
          store,
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
    return this.change(async (store, changed) => {
      const officer = await store.lockActiveOfficer(officerId);
      const request = await store.lock(reference);
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
        await this.changeStatus(store, request, 'in_progress', officerId),
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
    return this.change(async (store, changed) => {
      const officer = await store.lockActiveOfficer(officerId);
      const request = await store.lock(reference);
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
        await this.changeStatus(store, request, 'completed', officerId, {
          note,
        }),
      );
      return 'completed';
    });
  }

  /** Confirms Completed work while preserving the officer's Assignment. */
  async verify(
    reference: string,
    actorId: string,
  ): Promise<'verified' | NotFound | NotAllowed | WrongStatus> {
    return this.change(async (store, changed) => {
      const actor = await store.lockActor(actorId);
      const request = await store.lock(reference);
      if (!request) return 'not_found';
      if (
        !actor ||
        (actor.roleId !== 'administrator' && request.requesterId !== actorId)
      )
        return 'not_allowed';
      if (request.status !== 'completed') return wrongStatus(request.status);
      changed.push(
        await this.changeStatus(store, request, 'verified', actorId),
      );
      return 'verified';
    });
  }

  /** Rechecks each deadline under its request lock so answers can safely race the job. */
  async verifyOverdue(): Promise<number> {
    const cutoff = new Date(this.clock.now() - 7 * 24 * 60 * 60 * 1000);
    const due = await this.writes.overdue(cutoff);
    let verified = 0;
    for (const { reference } of due) {
      const overdue = await this.change(async (store, changed) => {
        const request = await store.lock(reference);
        if (
          !request ||
          request.status !== 'completed' ||
          !request.completedAt ||
          request.completedAt > cutoff
        )
          return false;
        changed.push(await this.changeStatus(store, request, 'verified', null));
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
    return this.change(async (store, changed) => {
      const actor = await store.lockActor(actorId);
      const request = await store.lock(reference);
      if (!request) return 'not_found';
      if (!actor || request.requesterId !== actorId) return 'not_allowed';
      if (request.status !== 'completed') return wrongStatus(request.status);
      const officer = request.assignment
        ? await store.activeOfficer(request.assignment.officerId)
        : undefined;
      if (!officer && request.assignment) {
        await store.endAssignment(
          request.assignment.id,
          'not_fixed',
          actorId,
          this.now(),
        );
      }
      changed.push({
        ...(await this.changeStatus(
          store,
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
    return this.change(async (store, changed) => {
      const actor = await store.lockActor(actorId);
      const request = await store.lock(reference);
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
        await store.endAssignment(
          request.assignment.id,
          'cancelled',
          actorId,
          this.now(),
        );
      changed.push({
        ...(await this.changeStatus(store, request, 'cancelled', actorId, {
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
    return this.writes.transaction(async (store) => {
      const actor = await store.lockActor(actorId);
      const request = await store.lock(reference);
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
        if (!(await store.hasCategory(edits.categoryId)))
          return 'unknown_category';
      }
      const before = await store.details(request.id);
      const changes: Record<string, { from: string; to: string }> = {};
      for (const field of Object.keys(edits) as (keyof DetailsEdits)[]) {
        const value = edits[field];
        if (value !== undefined && value !== before[field])
          changes[field] = { from: before[field], to: value };
      }
      if (Object.keys(changes).length === 0) return 'unchanged';
      await store.editDetails(request.id, edits);
      await this.record(store, request.id, this.now(), {
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
    return this.writes.transaction(async (store) => {
      const actor = await store.lockActor(actorId);
      const request = await store.lock(reference);
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
      await store.addProgressNote(request.id, actorId, text, this.now());
      return 'added';
    });
  }

  /** Changes Priority only on Open work, recording no entry for an unchanged value. */
  async setPriority(
    reference: string,
    actorId: string,
    priority: Priority,
  ): Promise<'changed' | 'unchanged' | NotFound | NotAllowed | WrongStatus> {
    return this.writes.transaction(async (store) => {
      const actor = await store.lockActor(actorId);
      const request = await store.lock(reference);
      if (!request) return 'not_found';
      if (actor?.roleId !== 'administrator') return 'not_allowed';
      if (!OPEN_STATUSES.includes(request.status))
        return wrongStatus(request.status);
      if (request.priority === priority) return 'unchanged';
      await store.setPriority(request.id, priority);
      await this.record(store, request.id, this.now(), {
        actorId,
        action: 'priority_changed',
        details: { from: request.priority, to: priority },
      });
      return 'changed';
    });
  }

  /**
   * An officer is leaving (`OfficerDepartures`): each request they hold
   * that's Assigned or In Progress goes back to Submitted, in the repository scope for the
   * transaction changing the User. That transaction has already locked the
   * officer's row; the requests come second, as when assigning. Answers
   * the emails to send once it commits.
   */
  async handBackAssignmentsOf(
    scope: RepositoryTransaction,
    officerId: string,
    actorId: string,
  ): Promise<AfterCommit> {
    const changed: ServiceRequestChange[] = [];
    const store = this.writes.within(scope);
    const candidates = await store.heldReferences(officerId);
    for (const { reference } of candidates) {
      // Completed work can reopen concurrently, so filter Status after locking.
      // Re-read its Assignment in case reassignment committed during the wait.
      const request = await store.lock(reference);
      if (
        !request ||
        !HELD.includes(request.status) ||
        request.assignment?.officerId !== officerId
      ) {
        continue;
      }
      changed.push(
        await this.handBack(
          store,
          request,
          request.assignment,
          'officer_left',
          actorId,
        ),
      );
    }
    return () => {
      this.events.emit(SERVICE_REQUESTS_COMMITTED, changed);
    };
  }

  /**
   * Runs a change in one transaction, collecting what it changed, and emails
   * about it only once that commits. A rolled-back change sends nothing.
   */
  private async change<T>(
    work: (
      store: ServiceRequestWritesRepository,
      changed: ServiceRequestChange[],
    ) => Promise<T>,
  ): Promise<T> {
    const changed: ServiceRequestChange[] = [];
    const outcome = await this.writes.transaction((store) =>
      work(store, changed),
    );
    if (changed.length) this.events.emit(SERVICE_REQUESTS_COMMITTED, changed);
    return outcome;
  }

  /** A Status Update on its own, such as starting or completing the work. */
  private async changeStatus(
    store: ServiceRequestWritesRepository,
    request: Locked,
    to: ServiceRequestStatus,
    actorId: string | null,
    details: { note?: string | null; reason?: string | null } = {},
  ): Promise<ServiceRequestChange> {
    const at = this.now();
    const moved = await this.moveTo(store, request, to, {
      actorId,
      at,
      ...details,
    });
    await this.record(store, request.id, at, {
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
    store: ServiceRequestWritesRepository,
    request: Locked,
    assignment: NonNullable<Locked['assignment']>,
    reason: Extract<AssignmentEndReason, 'unassigned' | 'officer_left'>,
    actorId: string,
  ): Promise<ServiceRequestChange> {
    const at = this.now();
    await store.endAssignment(assignment.id, reason, actorId, at);
    const moved = await this.moveTo(store, request, 'submitted', {
      actorId,
      at,
      assignmentId: assignment.id,
    });
    await this.record(store, request.id, at, {
      actorId,
      action: reason,
      details: { officerId: assignment.officerId, ...moved },
    });
    return this.news(request, actorId, moved, {
      ended: { officerId: assignment.officerId, why: reason },
    });
  }

  /**
   * Moves a request to a Status, recording the Status Update. Answers the
   * change it made, or nothing when the request was already there.
   */
  private async moveTo(
    store: ServiceRequestWritesRepository,
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
    await store.recordStatusChange(request.id, request.status, to, change);
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
    store: ServiceRequestWritesRepository,
    serviceRequestId: string,
    at: Date,
    entry: {
      actorId: string | null;
      action: ActivityAction;
      details?: Record<string, unknown>;
    },
  ) {
    return store.record({ ...entry, serviceRequestId }, at);
  }

  private now() {
    return new Date(this.clock.now());
  }
}
