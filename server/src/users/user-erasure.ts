import { Injectable } from '@nestjs/common';
import { SessionService } from '@nestjs/authentication';
import { UsersRepository } from './users.repository.js';

/**
 * Erasing a User, by an Administrator or by themselves (ADR-0002): their
 * personal details go, and so do all their sessions.
 */
@Injectable()
export class UserErasure {
  constructor(
    private readonly users: UsersRepository,
    private readonly sessions: SessionService,
  ) {}

  /** `actorId` is whoever erases them: an Administrator, or the User. */
  async erase(id: string, actorId: string) {
    const outcome = await this.users.erase(id, actorId);
    if (outcome === 'erased') {
      await this.sessions.revokeAll(id);
    }
    return outcome;
  }
}
