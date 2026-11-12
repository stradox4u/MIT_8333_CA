import { Injectable } from '@nestjs/common';
import {
  AuthenticationRegistry,
  OidcAccountResolver,
  type OidcProfile,
} from '@nestjs/authentication';
import { UsersRepository } from '../users/users.repository.js';
import { AccountDeactivatedException } from './account-deactivated.exception.js';

/**
 * Maps a Google account to a User (ADR-0006):
 *
 * - by Google's account id, once linked;
 * - else to the account with the same address, when Google verified it and
 *   that account has proven its address or has no password (an invitee who
 *   hasn't signed in yet);
 * - else to a new Pending Sign-up.
 *
 * Deactivated Users are told so.
 */
@Injectable()
export class GoogleAccounts extends OidcAccountResolver {
  constructor(
    private readonly users: UsersRepository,
    registry: AuthenticationRegistry,
  ) {
    super();
    registry.registerHandler('oidc', this);
  }

  async resolveUser(profile: OidcProfile) {
    const linked = await this.users.findByGoogleSubject(profile.subject);
    if (linked) {
      return this.unlessDeactivated(linked);
    }
    if (!profile.email || !profile.emailVerified) {
      return null;
    }

    const existing = await this.users.findForGoogle(profile.email);
    if (existing) {
      if (!existing.emailProven && existing.hasPassword) {
        // Unreachable while passwords need a proven address first; kept as
        // the guard against account pre-hijacking.
        return null;
      }
      this.unlessDeactivated(existing);
      await this.users.linkGoogle(existing.id, profile.subject);
      return { id: existing.id };
    }

    const id = await this.users.createPendingSignUp({
      email: profile.email,
      firstName: claim(profile, 'given_name'),
      lastName: claim(profile, 'family_name'),
    });
    await this.users.linkGoogle(id, profile.subject);
    return { id };
  }

  private unlessDeactivated(account: { id: string; deactivated: boolean }) {
    if (account.deactivated) {
      throw new AccountDeactivatedException();
    }
    return { id: account.id };
  }
}

function claim(profile: OidcProfile, name: string): string | null {
  const value = profile.claims[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
