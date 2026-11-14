import { createHash } from 'node:crypto';
import { Injectable, Module } from '@nestjs/common';
import { Clock } from '../clock.js';
import { RateLimitCountersRepository } from './rate-limit-counters.repository.js';

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

/** Fixed-window accounting, with persistence hidden behind its repository. */
@Injectable()
export class RateLimitCounters {
  constructor(
    private readonly repository: RateLimitCountersRepository,
    private readonly clock: Clock,
  ) {}

  async hit(key: string, windowMs: number): Promise<Hit> {
    const now = new Date(this.clock.now());
    const row = await this.repository.hit(
      hashed(key),
      now,
      new Date(now.getTime() + windowMs),
    );
    return {
      key,
      count: row.hits,
      windowEndsAt: row.windowEndsAt,
      msUntilWindowEnds: msUntil(row.windowEndsAt, now),
      msUntilUnblocked: row.blockedUntil ? msUntil(row.blockedUntil, now) : 0,
    };
  }

  block(key: string, durationMs: number): Promise<void> {
    return this.repository.block(
      hashed(key),
      new Date(this.clock.now() + durationMs),
    );
  }

  takeBack(hit: Hit): Promise<void> {
    return this.repository.takeBack(hashed(hit.key), hit.windowEndsAt);
  }

  deleteExpired(): Promise<void> {
    return this.repository.deleteExpired(new Date(this.clock.now()));
  }
}

@Module({
  providers: [RateLimitCountersRepository, RateLimitCounters],
  exports: [RateLimitCounters],
})
export class RateLimitCountersModule {}

function hashed(key: string) {
  return createHash('sha256').update(key).digest('base64url');
}
function msUntil(moment: Date, now: Date) {
  return Math.max(0, moment.getTime() - now.getTime());
}
