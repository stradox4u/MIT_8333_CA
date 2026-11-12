import { Injectable } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { AttemptLimit } from '../rate-limiting/failed-attempts.js';
import { FailedAttempts } from '../rate-limiting/failed-attempts.js';
import { normalizeEmail } from '../users/users.repository.js';

/** 5 wrong passwords per account per 15 minutes (docs/auth-module.md). */
const WRONG_PASSWORDS: AttemptLimit = { limit: 5, windowMs: 15 * 60 * 1000 };

/**
 * Wrong-password limits per account, shared by password sign-in and by
 * confirming with the current password: guessing on either counts toward
 * one lockout.
 */
@Injectable()
export class PasswordAttempts {
  constructor(private readonly attempts: FailedAttempts) {}

  /** Before checking a password for `email`: 429 once the limit is used up. */
  async begin(email: string): Promise<void> {
    if (!(await this.attempts.begin(keyFor(email), WRONG_PASSWORDS))) {
      throw new ThrottlerException(
        'Too many wrong passwords. Try again later.',
      );
    }
  }

  /** The password was right, so this attempt doesn't count. */
  async succeeded(email: string): Promise<void> {
    await this.attempts.succeeded(keyFor(email));
  }
}

function keyFor(email: string) {
  return `password:${normalizeEmail(email)}`;
}
