import {
  Body,
  Controller,
  HttpCode,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CurrentSession,
  CurrentUser,
  PasswordHasher,
  Public,
  SessionService,
  SignInService,
  type SessionRecord,
} from '@nestjs/authentication';
import { Mailer } from '@nestjs/mail';
import { Can } from '@nestjs/authorization';
import { z } from 'zod';
import { AccountPolicy } from './account.policy.js';
import { FreshAuthentication } from './fresh-authentication.js';
import { PasswordAttempts } from './password-attempts.js';
import { AccountDeactivatedException } from './account-deactivated.exception.js';
import {
  currentPassword,
  keepSignedIn,
  newPassword,
  offeredPassword,
  signInEmail,
} from './auth.schemas.js';
import type { User } from '../users/user.js';
import { UsersRepository } from '../users/users.repository.js';

const signInBody = z.object({
  email: signInEmail,
  password: offeredPassword,
  keepSignedIn,
});

/** A new password must meet the rules (ADR-0006). */
const setPasswordBody = z.object({ currentPassword, newPassword });

/** Optional passwords (ADR-0006): signing in with one, and setting one. */
@Controller('auth')
export class PasswordsController {
  constructor(
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly signIn: SignInService,
    private readonly sessions: SessionService,
    private readonly freshAuthentication: FreshAuthentication,
    private readonly mailer: Mailer,
    private readonly passwordAttempts: PasswordAttempts,
  ) {}

  @Public()
  @Post('sign-in')
  @HttpCode(200)
  async signInWithPassword(
    @Body({ schema: signInBody }) body: z.infer<typeof signInBody>,
  ) {
    const hit = await this.passwordAttempts.begin(body.email);
    const credentials = await this.users.findCredentials(body.email);
    // `verify()` checks a dummy hash when there is none, so an unknown address
    // takes as long as a wrong password.
    const valid = await this.hasher.verify(
      body.password,
      credentials?.passwordHash,
    );
    if (!credentials || !valid) {
      throw new UnauthorizedException('Wrong email or password');
    }
    await this.passwordAttempts.succeeded(hit);
    // Only after the right password: it tells strangers nothing.
    if (credentials.deactivated) {
      throw new AccountDeactivatedException();
    }
    await this.signIn.signIn(credentials.id, {
      method: 'password',
      metadata: { keepSignedIn: body.keepSignedIn },
    });
  }

  @Can(AccountPolicy, 'manage')
  @Put('password')
  @HttpCode(204)
  async setPassword(
    @CurrentUser() user: User,
    @CurrentSession() session: SessionRecord,
    @Body({ schema: setPasswordBody }) body: z.infer<typeof setPasswordBody>,
  ) {
    await this.freshAuthentication.require(user, session, body.currentPassword);
    await this.users.setPasswordHash(
      user.id,
      await this.hasher.hash(body.newPassword),
    );
    // Whoever else held a session no longer does, and this one gets a new id.
    await this.sessions.revokeAll(user.id, { except: session.id });
    await this.signIn.rotateSession();
    await this.mailer.send({
      to: user.email!,
      subject: 'A password was set on your account',
      text:
        'A password was just set on your MIT 8333 Maintenance account, and your other sessions were signed out.\n\n' +
        'If this wasn’t you, sign in with a sign-in link, set a new password and sign out everywhere.',
    });
  }
}
