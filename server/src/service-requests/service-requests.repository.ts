import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, exists, inArray, isNull } from 'drizzle-orm';
import { alias, type SelectedFields } from 'drizzle-orm/pg-core';
import { InjectDatabase, type Database } from '../database/database.js';
import {
  assignments,
  OPEN_STATUSES,
  progressNotes,
  requestCategories,
  serviceRequests,
  statusUpdates,
  users,
} from '../database/schema.js';
import { displayName } from '../users/display-name.js';
import { requestCategoryColumns } from './request-categories.js';
import type { NotFound } from './refusals.js';
import type { ServiceRequestAccess } from './service-request.policy.js';
import type {
  Person,
  ServiceRequestDetails,
  ServiceRequestPage,
} from './service-request.responses.js';
import type { StatusFilter } from './service-request.schemas.js';
import { buildTimeline } from './timeline.js';

const requesters = alias(users, 'requester');
const currentAssignments = alias(assignments, 'current_assignment');
const currentOfficers = alias(users, 'current_officer');
const actors = alias(users, 'actor');
const officers = alias(users, 'officer');
const assigners = alias(users, 'assigned_by');
const enders = alias(users, 'ended_by');

/** Which Service Requests a list holds. */
export type ListScope =
  { requestedBy: string } | { assignedTo: string } | { all: true };

/** The columns of a `ServiceRequestSummary`, its current Assignment flattened. */
const summaryColumns = {
  reference: serviceRequests.reference,
  title: serviceRequests.title,
  category: requestCategoryColumns,
  location: serviceRequests.location,
  status: serviceRequests.status,
  priority: serviceRequests.priority,
  requester: { id: requesters.id, name: displayName(requesters) },
  submittedAt: serviceRequests.submittedAt,
  currentOfficerId: currentOfficers.id,
  currentOfficerName: displayName(currentOfficers),
  assignedAt: currentAssignments.assignedAt,
};

/** Joins a request's current Assignment, if it has one. */
const isCurrentAssignment = and(
  eq(currentAssignments.serviceRequestId, serviceRequests.id),
  isNull(currentAssignments.endedAt),
);

/** Folds the flattened current Assignment into `assignment`. */
function withAssignment<
  Row extends {
    currentOfficerId: string | null;
    currentOfficerName: string;
    assignedAt: Date | null;
  },
>({ currentOfficerId, currentOfficerName, assignedAt, ...row }: Row) {
  return {
    ...row,
    assignment:
      currentOfficerId && assignedAt
        ? {
            officer: { id: currentOfficerId, name: currentOfficerName },
            assignedAt,
          }
        : null,
  };
}

/** A left-joined User as a `Person`, or `null` when there's none. */
const personOrNull = (id: string | null, name: string): Person | null =>
  id ? { id, name } : null;

/** A Status filter as a condition: that one Status, or any Open one. */
function hasStatus(filter: StatusFilter) {
  return filter === 'open'
    ? inArray(serviceRequests.status, OPEN_STATUSES)
    : eq(serviceRequests.status, filter);
}

@Injectable()
export class ServiceRequestsRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /** Who is connected to a Service Request, for the policy to decide on. */
  async findAccess(
    reference: string,
  ): Promise<ServiceRequestAccess | NotFound> {
    const [request] = await this.db
      .select({
        id: serviceRequests.id,
        requesterId: serviceRequests.requesterId,
        currentOfficerId: currentAssignments.officerId,
      })
      .from(serviceRequests)
      .leftJoin(currentAssignments, isCurrentAssignment)
      .where(eq(serviceRequests.reference, reference));
    if (!request) {
      return 'not_found';
    }
    const held = await this.db
      .selectDistinct({ officerId: assignments.officerId })
      .from(assignments)
      .where(eq(assignments.serviceRequestId, request.id));
    return {
      requesterId: request.requesterId,
      currentOfficerId: request.currentOfficerId,
      officerIds: held.map(({ officerId }) => officerId),
    };
  }

  /** A Service Request with its timeline, whoever asks: check `view` first. */
  async findDetails(
    reference: string,
  ): Promise<ServiceRequestDetails | NotFound> {
    const [request] = await this.selectSummaries({
      id: serviceRequests.id,
      description: serviceRequests.description,
    }).where(eq(serviceRequests.reference, reference));
    if (!request) {
      return 'not_found';
    }
    const { id, ...details } = withAssignment(request);
    return { ...details, timeline: await this.timeline(id) };
  }

  /** One page of a list of Service Requests, newest first. */
  async list(
    scope: ListScope,
    filters: { status?: StatusFilter; page: number; pageSize: number },
  ): Promise<ServiceRequestPage> {
    const { page, pageSize } = filters;
    const matching = and(
      this.inScope(scope),
      filters.status ? hasStatus(filters.status) : undefined,
    );
    const rows = await this.selectSummaries()
      .where(matching)
      // The id breaks ties, so pages never overlap.
      .orderBy(desc(serviceRequests.submittedAt), desc(serviceRequests.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const total = await this.db.$count(serviceRequests, matching);
    return { items: rows.map(withAssignment), page, pageSize, total };
  }

  /** A list's scope as a condition. */
  private inScope(scope: ListScope) {
    if ('requestedBy' in scope) {
      return eq(serviceRequests.requesterId, scope.requestedBy);
    }
    if ('assignedTo' in scope) {
      // Every request they've held an Assignment for, current or not.
      return exists(
        this.db
          .select({ id: assignments.id })
          .from(assignments)
          .where(
            and(
              eq(assignments.serviceRequestId, serviceRequests.id),
              eq(assignments.officerId, scope.assignedTo),
            ),
          ),
      );
    }
    return undefined;
  }

  /**
   * Service Requests with their Request Category, Requester and current
   * Assignment, plus `extra` columns.
   */
  private selectSummaries<Extra extends SelectedFields = Record<never, never>>(
    extra: Extra = {} as Extra,
  ) {
    return this.db
      .select({ ...summaryColumns, ...extra })
      .from(serviceRequests)
      .innerJoin(
        requestCategories,
        eq(requestCategories.id, serviceRequests.categoryId),
      )
      .innerJoin(requesters, eq(requesters.id, serviceRequests.requesterId))
      .leftJoin(currentAssignments, isCurrentAssignment)
      .leftJoin(
        currentOfficers,
        eq(currentOfficers.id, currentAssignments.officerId),
      );
  }

  /** Oldest first. */
  private async timeline(serviceRequestId: string) {
    const updates = await this.db
      .select({
        id: statusUpdates.id,
        occurredAt: statusUpdates.occurredAt,
        actorId: actors.id,
        actorName: displayName(actors),
        fromStatus: statusUpdates.fromStatus,
        toStatus: statusUpdates.toStatus,
        reason: statusUpdates.reason,
        note: statusUpdates.note,
        assignmentId: statusUpdates.assignmentId,
      })
      .from(statusUpdates)
      .leftJoin(actors, eq(actors.id, statusUpdates.actorId))
      .where(eq(statusUpdates.serviceRequestId, serviceRequestId));
    const held = await this.db
      .select({
        id: assignments.id,
        officer: { id: officers.id, name: displayName(officers) },
        assignedBy: { id: assigners.id, name: displayName(assigners) },
        assignedAt: assignments.assignedAt,
        endedById: enders.id,
        endedByName: displayName(enders),
        endedAt: assignments.endedAt,
        endReason: assignments.endReason,
      })
      .from(assignments)
      .innerJoin(officers, eq(officers.id, assignments.officerId))
      .innerJoin(assigners, eq(assigners.id, assignments.assignedById))
      .leftJoin(enders, eq(enders.id, assignments.endedById))
      .where(eq(assignments.serviceRequestId, serviceRequestId))
      .orderBy(asc(assignments.id));
    const notes = await this.db
      .select({
        id: progressNotes.id,
        createdAt: progressNotes.createdAt,
        actor: { id: actors.id, name: displayName(actors) },
        text: progressNotes.text,
      })
      .from(progressNotes)
      .innerJoin(actors, eq(actors.id, progressNotes.authorId))
      .where(eq(progressNotes.serviceRequestId, serviceRequestId));
    return buildTimeline(
      updates.map(({ actorId, actorName, ...update }) => ({
        ...update,
        actor: personOrNull(actorId, actorName),
      })),
      held.map(({ endedById, endedByName, ...assignment }) => ({
        ...assignment,
        endedBy: personOrNull(endedById, endedByName),
      })),
      notes,
    );
  }
}
