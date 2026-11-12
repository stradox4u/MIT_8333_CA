import { ForbiddenException, Injectable } from '@nestjs/common';
import { PasswordHasher, type SessionRecord } from '@nestjs/authentication';
import { Clock } from '../clock.js';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';
import { PasswordAttempts } from './password-attempts.js';

const FRESH_FOR_MS = 10 * 60 * 1000;

/**
 * Guards sensitive changes to an account (setting a password, erasing it)
 * against someone using a browser left signed in. The User proves it's them
 * with their current password, or by having signed in within the last 10
 * minutes (ADR-0006).
 */
@Injectable()
export class FreshAuthentication {
  constructor(
    private readonly clock: Clock,
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly passwordAttempts: PasswordAttempts,
  ) {}

  async require(
    user: User,
    session: SessionRecord,
    currentPassword: string | undefined,
  ): Promise<void> {
    if (currentPassword !== undefined) {
      // Guesses here count toward the same lockout as password sign-in.
      await this.passwordAttempts.begin(user.email!);
      const hash = await this.users.findPasswordHash(user.id);
      if (!(await this.hasher.verify(currentPassword, hash))) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'wrong_current_password',
          message: 'The current password is wrong',
        });
      }
      await this.passwordAttempts.succeeded(user.email!);
      return;
    }
    if (this.clock.now() - session.createdAt.getTime() > FRESH_FOR_MS) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'fresh_authentication_required',
        message:
          'Confirm it’s you: enter your current password, or sign in again',
      });
    }
  }
}
