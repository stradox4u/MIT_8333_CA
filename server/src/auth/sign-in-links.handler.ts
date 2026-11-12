import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  MagicLinkHandler,
  type MagicLink,
} from '@nestjs/authentication';
import { Mailer } from '@nestjs/mail';
import { UsersRepository } from '../users/users.repository.js';

/** Delivers Sign-in Links and maps a proven address to its account (ADR-0006). */
@Injectable()
export class SignInLinks extends MagicLinkHandler {
  constructor(
    private readonly users: UsersRepository,
    private readonly mailer: Mailer,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('magicLink', this);
  }

  async send({ email, url }: MagicLink) {
    if (await this.users.isDeactivated(email)) {
      await this.mailer.send({
        to: email,
        subject: 'Your account is deactivated',
        text:
          'Someone asked for a sign-in link for this address, but the account is deactivated.\n\n' +
          'Contact an administrator if you need access again.',
      });
      return;
    }
    await this.mailer.send({
      to: email,
      subject: 'Your sign-in link',
      text: `Use this link to sign in. It works once and expires in 15 minutes.\n\n${url}`,
    });
  }

  async resolveUser(email: string) {
    if (await this.users.isDeactivated(email)) {
      return null;
    }
    const user = await this.users.findOrCreateByProvenEmail(email);
    return { id: user.id, email };
  }
}
