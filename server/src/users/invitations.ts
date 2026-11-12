import { Injectable } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';
import { AppConfig } from '../config/app-config.js';
import type { RoleId } from '../database/schema.js';

const ROLE_NAMES: Record<RoleId, string> = {
  student: 'Student',
  staff: 'Staff',
  maintenance_officer: 'Maintenance Officer',
  administrator: 'Administrator',
};

/**
 * The Invitation email: a plain message pointing at the register page with
 * the address filled in. It carries no token; the invitee then signs in with
 * a Sign-in Link or Google like anyone else (docs/auth-module.md).
 */
@Injectable()
export class Invitations {
  constructor(
    private readonly mailer: Mailer,
    private readonly config: AppConfig,
  ) {}

  async send(invitee: { email: string; firstName: string; roleId: RoleId }) {
    const register = new URL('/register', this.config.appUrl);
    register.searchParams.set('email', invitee.email);
    await this.mailer.send({
      to: invitee.email,
      subject: 'You’ve been added to MIT 8333 Maintenance',
      text:
        `Hello ${invitee.firstName},\n\n` +
        `An administrator has added you to MIT 8333 Maintenance as a ${ROLE_NAMES[invitee.roleId]}.\n\n` +
        `Sign in with this address to get started:\n${register.href}`,
    });
  }
}
