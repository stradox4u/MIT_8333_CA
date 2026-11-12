import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  SessionCookieProvider,
  type SessionRecord,
} from '@nestjs/authentication';
import { Clock } from '../clock.js';
import { hasGoneIdle } from './session-lifetime.js';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

/** Signs requests in from the session cookie (ADR-0001). */
@Injectable()
export class SessionAuth extends SessionCookieProvider<User> {
  constructor(
    private readonly users: UsersRepository,
    private readonly clock: Clock,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerProvider(this);
  }

  /** `null` ends the session. */
  validate(session: SessionRecord) {
    const lastActiveAt = session.extra?.lastActiveAt ?? session.lastActiveAt;
    if (hasGoneIdle(session, lastActiveAt, this.clock.now())) {
      return null;
    }
    // Deactivated or erased since signing in: the session ends.
    return this.users.findSignInable(session.userId);
  }
}
