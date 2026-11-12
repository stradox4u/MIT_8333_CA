import type { ThrottlerStorage } from '@nestjs/throttler';
import { eq, sql } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Database } from '../database/database.js';
import { rateLimits } from '../database/schema.js';

/**
 * Throttler counters in Postgres, so limits survive redeploys and the API
 * holds no per-client state in memory. A fixed window per key: the first hit
 * opens a window of `ttl`; past `limit` hits the key is blocked for
 * `blockDuration`. Times come from the app's `Clock`.
 */
export class DrizzleThrottlerStorage implements ThrottlerStorage {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ) {
    const now = new Date(this.clock.now());
    const windowEnd = new Date(now.getTime() + ttl);
    const windowOver = sql`${rateLimits.windowEndsAt} <= ${now.toISOString()}::timestamptz`;
    const blocked = sql`${rateLimits.blockedUntil} > ${now.toISOString()}::timestamptz`;

    // One atomic upsert: a new window when the old one is over, no counting
    // while blocked, otherwise one more hit.
    const [row] = await this.db
      .insert(rateLimits)
      .values({ key, hits: 1, windowEndsAt: windowEnd })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          hits: sql`case when ${windowOver} and not coalesce(${blocked}, false) then 1
                         when coalesce(${blocked}, false) then ${rateLimits.hits}
                         else ${rateLimits.hits} + 1 end`,
          windowEndsAt: sql`case when ${windowOver} and not coalesce(${blocked}, false)
                                 then ${windowEnd.toISOString()}::timestamptz
                                 else ${rateLimits.windowEndsAt} end`,
          blockedUntil: sql`case when coalesce(${blocked}, false) then ${rateLimits.blockedUntil} else null end`,
        },
      })
      .returning();

    let blockedUntil = row.blockedUntil;
    if (!blockedUntil && row.hits > limit) {
      blockedUntil = new Date(now.getTime() + blockDuration);
      await this.db
        .update(rateLimits)
        .set({ blockedUntil })
        .where(eq(rateLimits.key, key));
    }

    return {
      totalHits: row.hits,
      timeToExpire: Math.max(0, row.windowEndsAt.getTime() - now.getTime()),
      isBlocked: blockedUntil !== null,
      timeToBlockExpire: blockedUntil
        ? Math.max(0, blockedUntil.getTime() - now.getTime())
        : 0,
    };
  }
}
