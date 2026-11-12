import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import {
  CurrentSession,
  CurrentUser,
  SessionService,
  SignInService,
  type SessionRecord,
} from '@nestjs/authentication';
import { Clock } from '../clock.js';
import { hasGoneIdle } from './session-lifetime.js';
import { Can } from '@nestjs/authorization';
import type { User } from '../users/user.js';

/** A User's own sessions: the "where you're signed in" page, and signing out. */
// Pending Sign-ups too: they can always see and end their own sessions.
@Can.Anyone()
@Controller('auth')
export class SessionsController {
  constructor(
    private readonly signIn: SignInService,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  @Get('sessions')
  async list(
    @CurrentUser() user: User,
    @CurrentSession() current: SessionRecord,
  ) {
    const now = this.clock.now();
    const sessions = await this.sessions.list(user.id);
    const live = sessions.filter(
      (session) => !hasGoneIdle(session, session.lastActiveAt, now),
    );
    return live.map((session) => ({
      id: session.id,
      userAgent: session.metadata?.userAgent ?? null,
      signedInAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      current: session.id === current.id,
    }));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async revoke(@CurrentUser() user: User, @Param('id') id: string) {
    const revoked = await this.sessions.revoke(id, { userId: user.id });
    if (!revoked) {
      throw new NotFoundException();
    }
  }

  @Post('sign-out')
  @HttpCode(204)
  async signOut() {
    await this.signIn.signOut();
  }

  @Post('sign-out-everywhere')
  @HttpCode(204)
  async signOutEverywhere(@CurrentUser() user: User) {
    await this.signIn.signOutEverywhere(user.id);
  }
}
