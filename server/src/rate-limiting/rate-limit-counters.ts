import { createHash } from 'node:crypto';
import { Injectable, Module } from '@nestjs/common';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import { rateLimits } from '../database/schema.js';

/** One counted hit, and its counter as it stands after it. */
export interface Hit {
  key: string;
  /** Hits in the current window, this one included. */
  count: number;
  /** The window this hit was counted in, for `takeBack()`. */
  windowEndsAt: Date;
  msUntilWindowEnds: number;
  /** 0 when the key isn't blocked. */
  msUntilUnblocked: number;
}

/**
 * Fixed-window counters in Postgres, behind every rate limit: the
 * throttlers' storage and the failed-attempt limits. Keys are stored hashed,
 * so an address someone typed never sits in the table (ADR-0002). Times come
 * from the app's `Clock`.
 */
@Injectable()
export class RateLimitCounters {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /**
   * One more hit on `key`, in one atomic step. The first hit, or the first
   * after a window ends, opens a window of `windowMs`; while the key is
   * blocked, hits don't count.
   */
  async hit(key: string, windowMs: number): Promise<Hit> {
    const now = new Date(this.clock.now());
    const at = sql`${now.toISOString()}::timestamptz`;
    const windowEnd = new Date(now.getTime() + windowMs);
    const blocked = sql`coalesce(${rateLimits.blockedUntil} > ${at}, false)`;
    const windowOver = sql`(${rateLimits.windowEndsAt} <= ${at} and not ${blocked})`;
    const [row] = await this.db
      .insert(rateLimits)
      .values({ key: hashed(key), hits: 1, windowEndsAt: windowEnd })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          hits: sql`case when ${windowOver} then 1
                         when ${blocked} then ${rateLimits.hits}
                         else ${rateLimits.hits} + 1 end`,
          windowEndsAt: sql`case when ${windowOver}
                                 then ${windowEnd.toISOString()}::timestamptz
                                 else ${rateLimits.windowEndsAt} end`,
          blockedUntil: sql`case when ${blocked} then ${rateLimits.blockedUntil} else null end`,
        },
      })
      .returning();
    return {
      key,
      count: row.hits,
      windowEndsAt: row.windowEndsAt,
      msUntilWindowEnds: msUntil(row.windowEndsAt, now),
      msUntilUnblocked: row.blockedUntil ? msUntil(row.blockedUntil, now) : 0,
    };
  }

  /** Blocks `key` for `durationMs`. */
  async block(key: string, durationMs: number): Promise<void> {
    await this.db
      .update(rateLimits)
      .set({ blockedUntil: new Date(this.clock.now() + durationMs) })
      .where(eq(rateLimits.key, hashed(key)));
  }

  /**
   * Takes a hit back, for an attempt that shouldn't count after all. Only
   * within the window it was counted in: a later window's hits are other
   * attempts.
   */
  async takeBack(hit: Hit): Promise<void> {
    await this.db
      .update(rateLimits)
      .set({ hits: sql`greatest(${rateLimits.hits} - 1, 0)` })
      .where(
        and(
          eq(rateLimits.key, hashed(hit.key)),
          eq(rateLimits.windowEndsAt, hit.windowEndsAt),
        ),
      );
  }

  /** Deletes counters whose window and block are both over. */
  async deleteExpired(): Promise<void> {
    const now = new Date(this.clock.now());
    await this.db
      .delete(rateLimits)
      .where(
        and(
          lte(rateLimits.windowEndsAt, now),
          or(
            isNull(rateLimits.blockedUntil),
            lte(rateLimits.blockedUntil, now),
          ),
        ),
      );
  }
}

/**
 * Its own module, so the throttlers' async factory and the modules that
 * count attempts (auth, cleanup) can import just the counters.
 */
@Module({ providers: [RateLimitCounters], exports: [RateLimitCounters] })
export class RateLimitCountersModule {}

function hashed(key: string) {
  return createHash('sha256').update(key).digest('base64url');
}

function msUntil(moment: Date, now: Date) {
  return Math.max(0, moment.getTime() - now.getTime());
}
