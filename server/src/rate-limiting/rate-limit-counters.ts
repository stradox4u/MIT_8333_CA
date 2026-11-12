import { createHash } from 'node:crypto';
import { Injectable, Module } from '@nestjs/common';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import { rateLimits } from '../database/schema.js';

/** A counter as it stands after a hit. */
export interface Counter {
  hits: number;
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
  async hit(key: string, windowMs: number): Promise<Counter> {
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
      hits: row.hits,
      msUntilWindowEnds: msUntil(row.windowEndsAt, now),
      msUntilUnblocked: row.blockedUntil ? msUntil(row.blockedUntil, now) : 0,
    };
  }

  /** Blocks `key` for `durationMs`; returns the block's length. */
  async block(key: string, durationMs: number): Promise<number> {
    await this.db
      .update(rateLimits)
      .set({ blockedUntil: new Date(this.clock.now() + durationMs) })
      .where(eq(rateLimits.key, hashed(key)));
    return durationMs;
  }

  /** Takes one hit back, for an attempt that turned out to be fine. */
  async takeBack(key: string): Promise<void> {
    await this.db
      .update(rateLimits)
      .set({ hits: sql`greatest(${rateLimits.hits} - 1, 0)` })
      .where(eq(rateLimits.key, hashed(key)));
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

/** Its own module, so the throttlers' async factory can inject it. */
@Module({ providers: [RateLimitCounters], exports: [RateLimitCounters] })
export class RateLimitCountersModule {}

function hashed(key: string) {
  return createHash('sha256').update(key).digest('base64url');
}

function msUntil(moment: Date, now: Date) {
  return Math.max(0, moment.getTime() - now.getTime());
}
