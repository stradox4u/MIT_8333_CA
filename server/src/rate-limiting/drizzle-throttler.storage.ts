import type { ThrottlerStorage } from '@nestjs/throttler';
import type { RateLimitCounters } from './rate-limit-counters.js';

/**
 * The throttlers' storage, on the shared Postgres counters: past `limit`
 * hits in a window, a key is blocked for `blockDuration`. The throttler
 * passes durations in milliseconds and wants the answers in seconds (they
 * become `Retry-After` and `X-RateLimit-Reset`).
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
      await this.counters.block(key, blockDuration);
      msUntilUnblocked = blockDuration;
    }
    return {
      totalHits: counter.hits,
      timeToExpire: seconds(counter.msUntilWindowEnds),
      isBlocked: msUntilUnblocked > 0,
      timeToBlockExpire: seconds(msUntilUnblocked),
    };
  }
}

function seconds(milliseconds: number) {
  return Math.ceil(milliseconds / 1000);
}
