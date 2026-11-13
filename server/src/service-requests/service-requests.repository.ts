import { Injectable } from '@nestjs/common';
import { asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import {
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

/** A Service Request's page: its details, and its timeline oldest first. */
export interface ServiceRequestDetails {
  reference: string;
  title: string;
  category: RequestCategory;
  location: string;
  description: string;
  status: ServiceRequestStatus;
  priority: Priority;
  requester: Person;
  submittedAt: Date;
  timeline: StatusUpdateEntry[];
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
    const [request] = await this.db
      .select({
        id: serviceRequests.id,
        reference: serviceRequests.reference,
        title: serviceRequests.title,
        category: {
          id: requestCategories.id,
          name: requestCategories.name,
          code: requestCategories.code,
        },
        location: serviceRequests.location,
        description: serviceRequests.description,
        status: serviceRequests.status,
        priority: serviceRequests.priority,
        requester: { id: requesters.id, name: displayName(requesters) },
        submittedAt: serviceRequests.submittedAt,
      })
      .from(serviceRequests)
      .innerJoin(
        requestCategories,
        eq(requestCategories.id, serviceRequests.categoryId),
      )
      .innerJoin(requesters, eq(requesters.id, serviceRequests.requesterId))
      .where(eq(serviceRequests.reference, reference));
    if (!request) {
      return null;
    }
    const { id, ...details } = request;
    return { ...details, timeline: await this.timeline(id) };
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
