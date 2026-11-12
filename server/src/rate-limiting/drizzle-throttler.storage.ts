import type { ThrottlerStorage } from '@nestjs/throttler';
import type { RateLimitCounters } from './rate-limit-counters.js';

/**
 * The throttlers' storage, on the shared Postgres counters: past `limit`
 * hits in a window, a key is blocked for `blockDuration`.
 */
export class DrizzleThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly counters: RateLimitCounters) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ) {
    const counter = await this.counters.hit(key, ttl);
    let msUntilUnblocked = counter.msUntilUnblocked;
    if (msUntilUnblocked === 0 && counter.hits > limit) {
      msUntilUnblocked = await this.counters.block(key, blockDuration);
    }
    return {
      totalHits: counter.hits,
      timeToExpire: counter.msUntilWindowEnds,
      isBlocked: msUntilUnblocked > 0,
      timeToBlockExpire: msUntilUnblocked,
    };
  }
}
