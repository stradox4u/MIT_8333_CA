import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias, type SelectedFields } from 'drizzle-orm/pg-core';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import {
  OPEN_STATUSES,
  type Priority,
  requestCategories,
  serviceRequests,
  type ServiceRequestStatus,
  statusUpdates,
  users,
} from '../database/schema.js';
import { displayName } from '../users/display-name.js';
import type { RequestCategory } from './request-categories.js';
import type { UnknownCategory } from './refusals.js';
import type { StatusFilter } from './service-request.schemas.js';

const requesters = alias(users, 'requester');
const actors = alias(users, 'actor');

/** What a Requester gives when they submit a Service Request. */
export interface NewServiceRequest {
  requesterId: string;
  title: string;
  categoryId: string;
  location: string;
  description: string;
}

/** A User as Service Requests show them: "First Last", or "Erased user". */
export interface Person {
  id: string;
  name: string;
}

/** A Status Update, as the timeline shows it. */
export interface StatusUpdateEntry {
  type: 'status_update';
  occurredAt: Date;
  /** `null` when nobody acted: the automatic verification after 7 days. */
  actor: Person | null;
  /** `null` for the move to Submitted when the request was submitted. */
  fromStatus: ServiceRequestStatus | null;
  toStatus: ServiceRequestStatus;
  reason: string | null;
}

/** A Service Request as lists show it. */
export interface ServiceRequestSummary {
  reference: string;
  title: string;
  category: RequestCategory;
  location: string;
  status: ServiceRequestStatus;
  priority: Priority;
  requester: Person;
  submittedAt: Date;
}

/** A Service Request's page: its details, and its timeline oldest first. */
export interface ServiceRequestDetails extends ServiceRequestSummary {
  description: string;
  timeline: StatusUpdateEntry[];
}

/** One page of a list, and how many items the whole list holds. */
export interface Page<Item> {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
}

/** The columns of a `ServiceRequestSummary`. */
const summaryColumns = {
  reference: serviceRequests.reference,
  title: serviceRequests.title,
  category: {
    id: requestCategories.id,
    name: requestCategories.name,
    code: requestCategories.code,
  },
  location: serviceRequests.location,
  status: serviceRequests.status,
  priority: serviceRequests.priority,
  requester: { id: requesters.id, name: displayName(requesters) },
  submittedAt: serviceRequests.submittedAt,
};

/** A Status filter as a condition: that one Status, or any Open one. */
function hasStatus(filter: StatusFilter) {
  return filter === 'open'
    ? inArray(serviceRequests.status, OPEN_STATUSES)
    : eq(serviceRequests.status, filter);
}

@Injectable()
export class ServiceRequestsRepository {
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
      // Locks the category's row until the transaction ends, so simultaneous
      // submissions take turns for its numbers.
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
      const now = new Date(this.clock.now());
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

  /** A Service Request with its timeline, whoever asks: check `view` first. */
  async findByReference(
    reference: string,
  ): Promise<ServiceRequestDetails | null> {
    const [request] = await this.selectSummaries({
      id: serviceRequests.id,
      description: serviceRequests.description,
    }).where(eq(serviceRequests.reference, reference));
    if (!request) {
      return null;
    }
    const { id, ...details } = request;
    return { ...details, timeline: await this.timeline(id) };
  }

  /** One page of the Service Requests a User raised, newest first. */
  async listRequestedBy(
    requesterId: string,
    filters: { status?: StatusFilter; page: number; pageSize: number },
  ): Promise<Page<ServiceRequestSummary>> {
    const { page, pageSize } = filters;
    const matching = and(
      eq(serviceRequests.requesterId, requesterId),
      filters.status ? hasStatus(filters.status) : undefined,
    );
    const items = await this.selectSummaries()
      .where(matching)
      // The id breaks ties, so pages never overlap.
      .orderBy(desc(serviceRequests.submittedAt), desc(serviceRequests.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const total = await this.db.$count(serviceRequests, matching);
    return { items, page, pageSize, total };
  }

  /** Service Requests with their Request Category and Requester, plus `extra` columns. */
  private selectSummaries<Extra extends SelectedFields>(
    extra: Extra = {} as Extra,
  ) {
    return this.db
      .select({ ...summaryColumns, ...extra })
      .from(serviceRequests)
      .innerJoin(
        requestCategories,
        eq(requestCategories.id, serviceRequests.categoryId),
      )
      .innerJoin(requesters, eq(requesters.id, serviceRequests.requesterId));
  }

  /** Oldest first. */
  private async timeline(
    serviceRequestId: string,
  ): Promise<StatusUpdateEntry[]> {
    const updates = await this.db
      .select({
        occurredAt: statusUpdates.occurredAt,
        actorId: actors.id,
        actorName: displayName(actors),
        fromStatus: statusUpdates.fromStatus,
        toStatus: statusUpdates.toStatus,
        reason: statusUpdates.reason,
      })
      .from(statusUpdates)
      .leftJoin(actors, eq(actors.id, statusUpdates.actorId))
      .where(eq(statusUpdates.serviceRequestId, serviceRequestId))
      .orderBy(asc(statusUpdates.occurredAt), asc(statusUpdates.id));
    return updates.map(({ actorId, actorName, ...update }) => ({
      type: 'status_update',
      ...update,
      actor: actorId ? { id: actorId, name: actorName } : null,
    }));
  }
}
