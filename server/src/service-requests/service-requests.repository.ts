import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import { requestCategories, serviceRequests } from '../database/schema.js';
import type { UnknownCategory } from './refusals.js';

/** What a Requester gives when they submit a Service Request. */
export interface NewServiceRequest {
  requesterId: string;
  title: string;
  categoryId: string;
  location: string;
  description: string;
}

@Injectable()
export class ServiceRequestsRepository {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /**
   * Submits a Service Request, with its Request Category's next Reference.
   * Taking the number and inserting the request are one transaction, so a
   * number is never used twice or skipped.
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
      await tx.insert(serviceRequests).values({
        ...request,
        reference,
        status: 'submitted',
        submittedAt: new Date(this.clock.now()),
      });
      return { reference };
    });
  }
}
