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
import { sessionId } from './auth.schemas.js';
import { hasGoneIdle } from './session-lifetime.js';
import { Can } from '@nestjs/authorization';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { sessionsResponse } from './auth.responses.js';
import { ApiErrors } from '../api-docs.js';
import type { User } from '../users/user.js';

/** A User's own sessions: the "where you're signed in" page, and signing out. */
// Pending Sign-ups too: they can always see and end their own sessions.
@Can.Anyone()
@ApiErrors(401)
@Controller('auth')
export class SessionsController {
  constructor(
    private readonly signIn: SignInService,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  @Get('sessions')
  @ApiOkResponse({
    description: 'Your unexpired sessions, with the current session marked.',
    standardSchema: sessionsResponse,
  })
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
  @ApiNoContentResponse({
    description: 'Your selected session revoked; no response body.',
  })
  @ApiErrors(400, 404)
  async revoke(
    @CurrentUser() user: User,
    @Param('id', { schema: sessionId }) id: string,
  ) {
    const revoked = await this.sessions.revoke(id, { userId: user.id });
    if (!revoked) {
      throw new NotFoundException();
    }
  }

  @Post('sign-out')
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'Current session ended; no response body.',
  })
  async signOut() {
    await this.signIn.signOut();
  }

  @Post('sign-out-everywhere')
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'All your sessions ended; no response body.',
  })
  async signOutEverywhere(@CurrentUser() user: User) {
    await this.signIn.signOutEverywhere(user.id);
  }
}
