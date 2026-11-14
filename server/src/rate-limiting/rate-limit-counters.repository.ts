import { Injectable } from '@nestjs/common';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { InjectDatabase, type Database } from '../database/database.js';
import { rateLimits } from '../database/schema.js';

export interface CounterRow {
  hits: number;
  windowEndsAt: Date;
  blockedUntil: Date | null;
}

@Injectable()
export class RateLimitCountersRepository {
  constructor(@InjectDatabase() private readonly db: Database) {}

  /**
   * One more hit on `key`, in one atomic step. The first hit, or the first
   * after a window ends, opens a window of `windowMs`; while the key is
   * blocked, hits don't count.
   */
  async hit(key: string, now: Date, windowEnd: Date): Promise<CounterRow> {
    const at = sql`${now.toISOString()}::timestamptz`;
    const blocked = sql`coalesce(${rateLimits.blockedUntil} > ${at}, false)`;
    const windowOver = sql`(${rateLimits.windowEndsAt} <= ${at} and not ${blocked})`;
    const [row] = await this.db
      .insert(rateLimits)
      .values({ key: key, hits: 1, windowEndsAt: windowEnd })
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
    return row;
  }

  /** Blocks `key` for `durationMs`. */
  async block(key: string, until: Date): Promise<void> {
    await this.db
      .update(rateLimits)
      .set({ blockedUntil: until })
      .where(eq(rateLimits.key, key));
  }

  /**
   * Takes a hit back, for an attempt that shouldn't count after all. Only
   * within the window it was counted in: a later window's hits are other
   * attempts.
   */
  async takeBack(key: string, windowEndsAt: Date): Promise<void> {
    await this.db
      .update(rateLimits)
      .set({ hits: sql`greatest(${rateLimits.hits} - 1, 0)` })
      .where(
        and(eq(rateLimits.key, key), eq(rateLimits.windowEndsAt, windowEndsAt)),
      );
  }

  /** Deletes counters whose window and block are both over. */
  async deleteExpired(now: Date): Promise<void> {
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
