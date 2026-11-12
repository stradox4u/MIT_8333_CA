import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, MagicLinkService, Public } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import type { Response } from 'express';
import { z } from 'zod';
import { personName, selfChosenRole } from '../users/user.schemas.js';
import { keepSignedIn, signInEmail, signInLinkToken } from './auth.schemas.js';
import { RateLimitGuard } from '../rate-limiting/rate-limit.guard.js';
import { KeepSignedInCookie } from './keep-signed-in.cookie.js';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

const signInLinkBody = z.object({
  // Malformed addresses get the same 202 and no mail (the package checks).
  email: signInEmail,
  keepSignedIn,
});

const consumeSignInLinkBody = z.object({ token: signInLinkToken });

const completeSignUpBody = z.object({
  firstName: personName,
  lastName: personName,
  // Maintenance Officers and Administrators are invited, never self-chosen.
  role: selfChosenRole,
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly signInLinks: MagicLinkService,
    private readonly users: UsersRepository,
    private readonly keepSignedIn: KeepSignedInCookie,
  ) {}

  @Public()
  // 10 per IP, and 3 per address and IP, per 15 minutes.
  @UseGuards(RateLimitGuard)
  @Post('sign-in-link')
  @HttpCode(202)
  async requestSignInLink(
    @Body({ schema: signInLinkBody }) body: z.infer<typeof signInLinkBody>,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.keepSignedIn.remember(response, body.keepSignedIn);
    // Answers 202 whether or not the address has an account (ADR-0006).
    await this.signInLinks.create(body.email);
  }

  @Public()
  @Post('sign-in-link/consume')
  @HttpCode(200)
  async consumeSignInLink(
    @Body({ schema: consumeSignInLinkBody })
    body: z.infer<typeof consumeSignInLinkBody>,
  ) {
    const signedIn = await this.signInLinks.consume(body.token);
    if (!signedIn) {
      throw new UnauthorizedException();
    }
  }

  // Pending Sign-ups too: the client reads `signUpComplete` here.
  @Can.Anyone()
  @Get('me')
  me(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.roleId,
      signUpComplete: user.roleId !== null,
      hasPassword: user.hasPassword,
    };
  }

  @Can.Anyone()
  @Post('sign-up/complete')
  @HttpCode(200)
  async completeSignUp(
    @CurrentUser() user: User,
    @Body({ schema: completeSignUpBody })
    body: z.infer<typeof completeSignUpBody>,
  ) {
    const completed = await this.users.completeSignUp(user.id, {
      firstName: body.firstName,
      lastName: body.lastName,
      roleId: body.role,
    });
    if (!completed) {
      throw new ConflictException('Sign-up is already complete');
    }
  }
}
