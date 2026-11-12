import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import { rateLimits } from '../database/schema.js';

/**
 * Counts failures only, unlike the throttlers, which count every request.
 * For password sign-in: 5 wrong passwords per account in 15 minutes lock it
 * out until the window ends; signing in successfully never counts
 * (docs/auth-module.md). Shares the throttlers' table and daily cleanup.
 */
@Injectable()
export class FailedAttempts {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async isLockedOut(key: string, limit: number): Promise<boolean> {
    const [row] = await this.db
      .select({ hits: rateLimits.hits, windowEndsAt: rateLimits.windowEndsAt })
      .from(rateLimits)
      .where(eq(rateLimits.key, key));
    return (
      row !== undefined &&
      row.windowEndsAt.getTime() > this.clock.now() &&
      row.hits >= limit
    );
  }

  /** One more failure; the first opens a window of `windowMs`. */
  async recordFailure(key: string, windowMs: number): Promise<void> {
    const now = new Date(this.clock.now());
    const windowEnd = new Date(now.getTime() + windowMs);
    const windowOver = sql`${rateLimits.windowEndsAt} <= ${now.toISOString()}::timestamptz`;
    await this.db
      .insert(rateLimits)
      .values({ key, hits: 1, windowEndsAt: windowEnd })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          hits: sql`case when ${windowOver} then 1 else ${rateLimits.hits} + 1 end`,
          windowEndsAt: sql`case when ${windowOver} then ${windowEnd.toISOString()}::timestamptz else ${rateLimits.windowEndsAt} end`,
        },
      });
  }
}
