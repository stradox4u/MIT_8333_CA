import { Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  type Counter,
  RateLimitCounters,
} from '../rate-limiting/rate-limit-counters.js';
import { normalizeEmail } from '../users/users.repository.js';

/** 5 wrong passwords per account per 15 minutes (docs/auth-module.md). */
const WRONG_PASSWORDS_ALLOWED = 5;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Wrong-password limits per account, shared by password sign-in and by
 * confirming with the current password: guessing on either counts toward
 * one lockout.
 *
 * Each attempt is counted before its password is checked, in one atomic
 * step, so a burst of simultaneous guesses can't all get in before any is
 * counted. An attempt whose password was right is handed back with
 * `succeeded()`. The price: attempts still being checked count too, so many
 * simultaneous right passwords for one account can briefly hit the limit.
 */
@Injectable()
export class PasswordAttempts {
  constructor(private readonly counters: RateLimitCounters) {}

  /**
   * Counts an attempt for `email`, before its password is checked: 429 once
   * the limit is used up. Hand the result to `succeeded()` if it was right.
   */
  async begin(email: string): Promise<Counter> {
    const counted = await this.counters.hit(keyFor(email), WINDOW_MS);
    if (counted.hits > WRONG_PASSWORDS_ALLOWED) {
      throw new ThrottlerException(
        'Too many wrong passwords. Try again later.',
      );
    }
    return counted;
  }

  /** The password was right, so this attempt doesn't count. */
  async succeeded(email: string, counted: Counter): Promise<void> {
    await this.counters.takeBack(keyFor(email), counted);
  }
}

function keyFor(email: string) {
  return `password:${normalizeEmail(email)}`;
}
