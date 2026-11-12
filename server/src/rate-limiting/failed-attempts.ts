import { Injectable } from '@nestjs/common';
import { RateLimitCounters } from './rate-limit-counters.js';

/** How many attempts may fail per key, in a fixed window. */
export interface AttemptLimit {
  limit: number;
  windowMs: number;
}

/**
 * Limits failed attempts, not attempts: unlike the throttlers, an attempt
 * that succeeds doesn't count.
 *
 * Each attempt is counted before it's checked, in one atomic step, so a
 * burst of concurrent attempts can't all get in before any is counted. Once
 * the limit is reached, `begin()` says no and the attempt must be refused
 * unchecked. An attempt that turns out fine is handed back with
 * `succeeded()`.
 */
@Injectable()
export class FailedAttempts {
  constructor(private readonly counters: RateLimitCounters) {}

  /** Counts the attempt; `false` when the limit is already used up. */
  async begin(key: string, { limit, windowMs }: AttemptLimit) {
    const counter = await this.counters.hit(key, windowMs);
    return counter.hits <= limit;
  }

  async succeeded(key: string): Promise<void> {
    await this.counters.takeBack(key);
  }
}
