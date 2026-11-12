import { Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import {
  type Hit,
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
 * counted. Only wrong passwords stay counted: an attempt refused over the
 * limit is handed back at once (no password was checked), and one whose
 * password was right is handed back with `succeeded()`. So many
 * simultaneous right passwords can be refused while they're in flight, but
 * leave nothing counted behind.
 */
@Injectable()
export class PasswordAttempts {
  constructor(private readonly counters: RateLimitCounters) {}

  /**
   * Counts an attempt for `email`, before its password is checked: 429 once
   * the limit is used up. Hand the hit to `succeeded()` if it was right.
   */
  async begin(email: string): Promise<Hit> {
    const hit = await this.counters.hit(keyFor(email), WINDOW_MS);
    if (hit.count > WRONG_PASSWORDS_ALLOWED) {
      await this.counters.takeBack(hit);
      throw new ThrottlerException(
        'Too many wrong passwords. Try again later.',
      );
    }
    return hit;
  }

  /** The password was right, so this attempt doesn't count. */
  async succeeded(hit: Hit): Promise<void> {
    await this.counters.takeBack(hit);
  }
}

function keyFor(email: string) {
  return `password:${normalizeEmail(email)}`;
}
