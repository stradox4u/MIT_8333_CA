import {
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
} from '@nestjs/common';
import {
  CurrentSession,
  CurrentUser,
  type SessionRecord,
} from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import { ActivityLogRepository } from '../users/activity-log.repository.js';
import { UserErasure } from '../users/user-erasure.js';
import type { User } from '../users/user.js';
import { AccountPolicy } from './account.policy.js';
import { currentPassword } from './auth.schemas.js';
import { FreshAuthentication } from './fresh-authentication.js';

const eraseSelfBody = z.object({ currentPassword }).optional();

/** A User acting on their own account. */
@Controller('me')
export class AccountController {
  constructor(
    private readonly freshAuthentication: FreshAuthentication,
    private readonly erasure: UserErasure,
    private readonly activityLog: ActivityLogRepository,
  ) {}

  /** Erases the User's own account (ADR-0002), after fresh authentication. */
  @Can(AccountPolicy, 'manage')
  @Delete()
  @HttpCode(204)
  async eraseSelf(
    @CurrentUser() user: User,
    @CurrentSession() session: SessionRecord,
    @Body({ schema: eraseSelfBody }) body: z.infer<typeof eraseSelfBody>,
  ) {
    await this.freshAuthentication.require(
      user,
      session,
      body?.currentPassword,
    );
    const outcome = await this.erasure.erase(user.id, user.id);
    if (outcome === 'last_administrator') {
      throw new ConflictException(
        'You’re the last active Administrator: make someone else one first',
      );
    }
    if (outcome === 'erased') {
      await this.activityLog.record({
        actorId: user.id,
        targetId: user.id,
        action: 'erased',
      });
    }
  }
}
