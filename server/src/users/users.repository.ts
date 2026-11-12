import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import {
  googleIdentities,
  type RoleId,
  roles,
  signInLinks,
  users,
} from '../database/schema.js';
import { displayName } from './display-name.js';
import type { LastAdministrator, NotFound, UserErased } from './refusals.js';
import type { User } from './user.js';

/** The columns that make a `User`: everything but the password hash. */
const userColumns = {
  id: users.id,
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  roleId: users.roleId,
  hasPassword: sql<boolean>`${users.passwordHash} is not null`,
};

/** How addresses are stored: trimmed, lowercased, NFC (as the auth package compares them). */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase().normalize('NFC');
}

/** How an Administrator sees a User in the list. */
export interface ManagedUser {
  id: string;
  /** "First Last", or "Erased user" once erased. */
  name: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: RoleId;
  status: 'invited' | 'active' | 'deactivated' | 'erased';
  createdAt: Date;
}

/** The columns of a `ManagedUser`: what Administrators see of a User. */
const managedUserColumns = {
  id: users.id,
  name: displayName(users),
  email: users.email,
  firstName: users.firstName,
  lastName: users.lastName,
  role: sql<RoleId>`${users.roleId}`,
  status: sql<ManagedUser['status']>`case
    when ${users.erasedAt} is not null then 'erased'
    when ${users.deactivatedAt} is not null then 'deactivated'
    when ${users.emailVerifiedAt} is not null then 'active'
    else 'invited' end`,
  createdAt: users.createdAt,
};

/**
 * An active Administrator: one who can actually sign in and manage the
 * system. They have signed in at least once (an Invitation still pending
 * doesn't count), and are neither deactivated nor erased.
 */
const activeAdministrator = and(
  eq(users.roleId, 'administrator'),
  isNotNull(users.emailVerifiedAt),
  isNull(users.deactivatedAt),
  isNull(users.erasedAt),
);

export interface NewUser {
  email: string;
  firstName: string;
  lastName: string;
  roleId: RoleId;
}

@Injectable()
export class UsersRepository {
  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<User | null> {
    const [user] = await this.db
      .select(userColumns)
      .from(users)
      .where(eq(users.id, id));
    return user ?? null;
  }

  /** The account a session belongs to, unless it was deactivated or erased since. */
  async findSignInable(id: string): Promise<User | null> {
    const [user] = await this.db
      .select(userColumns)
      .from(users)
      .where(
        and(
          eq(users.id, id),
          isNull(users.deactivatedAt),
          isNull(users.erasedAt),
        ),
      );
    return user ?? null;
  }

  /** Whether the account for an address is deactivated. */
  async isDeactivated(email: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.email, normalizeEmail(email)),
          isNotNull(users.deactivatedAt),
        ),
      );
    return row !== undefined;
  }

  /**
   * Deactivates a User, unless they're the last active Administrator.
   * `already_deactivated` and `user_erased` change nothing.
   */
  async deactivate(
    id: string,
  ): Promise<
    | 'deactivated'
    | 'already_deactivated'
    | UserErased
    | NotFound
    | LastAdministrator
  > {
    const changed = await this.db
      .update(users)
      .set({ deactivatedAt: this.now() })
      .where(
        and(
          eq(users.id, id),
          isNotNull(users.roleId),
          isNull(users.deactivatedAt),
          isNull(users.erasedAt),
          this.notTheLastActiveAdministrator(id),
        ),
      )
      .returning({ id: users.id });
    if (changed.length > 0) {
      return 'deactivated';
    }
    const state = await this.stateOf(id);
    if (!state) {
      return 'not_found';
    }
    if (state.erased) {
      return 'user_erased';
    }
    return state.deactivated ? 'already_deactivated' : 'last_administrator';
  }

  /**
   * Erases a User (ADR-0002): clears their name, email and password, and
   * deletes Sign-in Links sent to them, keeping the row so their records stay
   * linked. Refused for the last active Administrator. `already_erased`
   * changes nothing.
   */
  async erase(
    id: string,
  ): Promise<'erased' | 'already_erased' | NotFound | LastAdministrator> {
    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({
          email: users.email,
          erasedAt: users.erasedAt,
          roleId: users.roleId,
        })
        .from(users)
        .where(eq(users.id, id))
        .for('update');
      if (!target?.roleId) {
        return 'not_found';
      }
      if (target.erasedAt) {
        return 'already_erased';
      }
      const erased = await tx
        .update(users)
        .set({
          email: null,
          firstName: null,
          lastName: null,
          passwordHash: null,
          erasedAt: this.now(),
        })
        .where(and(eq(users.id, id), this.notTheLastActiveAdministrator(id)))
        .returning({ id: users.id });
      if (erased.length === 0) {
        return 'last_administrator';
      }
      if (target.email) {
        await tx.delete(signInLinks).where(eq(signInLinks.email, target.email));
      }
      await tx.delete(googleIdentities).where(eq(googleIdentities.userId, id));
      return 'erased';
    });
  }

  /**
   * The invitee of a pending Invitation (invited, never signed in), or why
   * there is none.
   */
  async findPendingInvitation(
    id: string,
  ): Promise<
    | { email: string; firstName: string; roleId: RoleId }
    | NotFound
    | 'not_pending'
  > {
    const [row] = await this.db
      .select({
        email: users.email,
        firstName: users.firstName,
        roleId: users.roleId,
        emailVerifiedAt: users.emailVerifiedAt,
        erasedAt: users.erasedAt,
      })
      .from(users)
      .where(eq(users.id, id));
    if (!row?.roleId) {
      return 'not_found';
    }
    if (row.emailVerifiedAt || row.erasedAt || !row.email || !row.firstName) {
      return 'not_pending';
    }
    return { email: row.email, firstName: row.firstName, roleId: row.roleId };
  }

  /**
   * Corrects the address of a pending Invitation. Addresses can't change
   * otherwise (docs/auth-module.md).
   */
  async correctInvitationEmail(
    id: string,
    email: string,
  ): Promise<'corrected' | NotFound | 'not_pending' | 'taken'> {
    const invitation = await this.findPendingInvitation(id);
    if (typeof invitation === 'string') {
      return invitation;
    }
    const address = normalizeEmail(email);
    const [holder] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, address));
    if (holder && holder.id !== id) {
      return 'taken';
    }
    const corrected = await this.db
      .update(users)
      .set({ email: address })
      .where(and(eq(users.id, id), isNull(users.emailVerifiedAt)))
      .returning({ id: users.id });
    return corrected.length > 0 ? 'corrected' : 'not_pending';
  }

  /**
   * Deletes Pending Sign-ups (no Role yet) created before `cutoff`, and
   * returns their ids. Nothing references them, so they go outright.
   */
  async deletePendingSignUpsCreatedBefore(cutoff: Date): Promise<string[]> {
    const deleted = await this.db
      .delete(users)
      .where(and(isNull(users.roleId), lte(users.createdAt, cutoff)))
      .returning({ id: users.id });
    return deleted.map(({ id }) => id);
  }

  /** Lifts a deactivation. `not_deactivated` and `user_erased` change nothing. */
  async reactivate(
    id: string,
  ): Promise<'reactivated' | 'not_deactivated' | UserErased | NotFound> {
    const changed = await this.db
      .update(users)
      .set({ deactivatedAt: null })
      .where(
        and(
          eq(users.id, id),
          isNotNull(users.roleId),
          isNotNull(users.deactivatedAt),
          isNull(users.erasedAt),
        ),
      )
      .returning({ id: users.id });
    if (changed.length > 0) {
      return 'reactivated';
    }
    const state = await this.stateOf(id);
    if (!state) {
      return 'not_found';
    }
    return state.erased ? 'user_erased' : 'not_deactivated';
  }

  /** Every User, oldest first. Pending Sign-ups aren't Users yet, so they're left out. */
  async list(): Promise<ManagedUser[]> {
    return this.db
      .select(managedUserColumns)
      .from(users)
      .where(isNotNull(users.roleId))
      .orderBy(asc(users.createdAt), asc(users.email));
  }

  /** One User as the Users list shows them; `null` for a Pending Sign-up. */
  async findManaged(id: string): Promise<ManagedUser | null> {
    const [user] = await this.db
      .select(managedUserColumns)
      .from(users)
      .where(and(eq(users.id, id), isNotNull(users.roleId)));
    return user ?? null;
  }

  /**
   * Changes a User's Role, unless that would leave no active Administrator.
   * The check and the change are one statement.
   */
  async changeRole(
    id: string,
    roleId: RoleId,
  ): Promise<'changed' | UserErased | NotFound | LastAdministrator> {
    const changed = await this.db
      .update(users)
      .set({ roleId })
      .where(
        and(
          eq(users.id, id),
          isNotNull(users.roleId),
          isNull(users.erasedAt),
          roleId === 'administrator'
            ? undefined
            : this.notTheLastActiveAdministrator(id),
        ),
      )
      .returning({ id: users.id });
    if (changed.length > 0) {
      return 'changed';
    }
    const state = await this.stateOf(id);
    if (!state) {
      return 'not_found';
    }
    return state.erased ? 'user_erased' : 'last_administrator';
  }

  /**
   * Creates or resets a demo account: the given details and password, an
   * address counted as proven, and not deactivated.
   */
  async upsertDemoUser(
    user: NewUser & { passwordHash: string },
  ): Promise<void> {
    const now = this.now();
    const values = {
      ...user,
      email: normalizeEmail(user.email),
      emailVerifiedAt: now,
      deactivatedAt: null,
    };
    await this.db
      .insert(users)
      .values({ ...values, createdAt: now })
      .onConflictDoUpdate({ target: users.email, set: values });
  }

  /** Creates a User outright, as the tests' Administrators. */
  async createUser(user: NewUser): Promise<User> {
    const [created] = await this.db
      .insert(users)
      .values({
        ...user,
        email: normalizeEmail(user.email),
        createdAt: this.now(),
      })
      .returning(userColumns);
    return created;
  }

  /**
   * An Administrator's Invitation: creates the account, or fills in a Pending
   * Sign-up for the same address. `null` when the address already has a User
   * or an Invitation.
   */
  async invite(user: NewUser): Promise<User | null> {
    const [invited] = await this.db
      .insert(users)
      .values({
        ...user,
        email: normalizeEmail(user.email),
        createdAt: this.now(),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          firstName: user.firstName,
          lastName: user.lastName,
          roleId: user.roleId,
        },
        setWhere: isNull(users.roleId),
      })
      .returning(userColumns);
    return invited ?? null;
  }

  /**
   * The account for an address its owner just proved (a Sign-in Link),
   * created as a Pending Sign-up the first time.
   */
  async findOrCreateByProvenEmail(email: string): Promise<User> {
    const now = this.now();
    const [user] = await this.db
      .insert(users)
      .values({ email, createdAt: now, emailVerifiedAt: now })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now.toISOString()}::timestamptz)`,
        },
      })
      .returning(userColumns);
    return user;
  }

  /**
   * Turns a Pending Sign-up into a User. `false` when the account has already
   * finished sign-up: from then on only an Administrator changes the Role.
   */
  async completeSignUp(
    id: string,
    details: { firstName: string; lastName: string; roleId: RoleId },
  ): Promise<boolean> {
    const updated = await this.db
      .update(users)
      .set(details)
      .where(and(eq(users.id, id), isNull(users.roleId)))
      .returning({ id: users.id });
    return updated.length > 0;
  }

  /** The User a Google account is linked to. */
  async findByGoogleSubject(subject: string) {
    const [row] = await this.db
      .select({
        id: users.id,
        deactivated: sql<boolean>`${users.deactivatedAt} is not null`,
      })
      .from(googleIdentities)
      .innerJoin(users, eq(users.id, googleIdentities.userId))
      .where(eq(googleIdentities.subject, subject));
    return row ?? null;
  }

  /** What Google sign-in needs to know about the account for an address. */
  async findForGoogle(email: string) {
    const [row] = await this.db
      .select({
        id: users.id,
        emailProven: sql<boolean>`${users.emailVerifiedAt} is not null`,
        hasPassword: sql<boolean>`${users.passwordHash} is not null`,
        deactivated: sql<boolean>`${users.deactivatedAt} is not null`,
      })
      .from(users)
      .where(eq(users.email, normalizeEmail(email)));
    return row ?? null;
  }

  /**
   * Links a Google account to a User, which also proves their address
   * (Google verified it).
   */
  async linkGoogle(userId: string, subject: string): Promise<void> {
    const now = this.now();
    await this.db
      .insert(googleIdentities)
      .values({ subject, userId, linkedAt: now })
      .onConflictDoNothing();
    await this.db
      .update(users)
      .set({
        emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now.toISOString()}::timestamptz)`,
      })
      .where(eq(users.id, userId));
  }

  /**
   * A Pending Sign-up for a first-time Google user, with the name Google gave
   * filled in for Finish sign-up to show.
   */
  async createPendingSignUp(details: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  }): Promise<string> {
    const now = this.now();
    const [created] = await this.db
      .insert(users)
      .values({
        ...details,
        email: normalizeEmail(details.email),
        createdAt: now,
        emailVerifiedAt: now,
      })
      .returning({ id: users.id });
    return created.id;
  }

  /** The account and password hash for an address, for password sign-in. */
  async findCredentials(email: string): Promise<{
    id: string;
    passwordHash: string | null;
    deactivated: boolean;
  } | null> {
    const [credentials] = await this.db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        deactivated: sql<boolean>`${users.deactivatedAt} is not null`,
      })
      .from(users)
      .where(eq(users.email, normalizeEmail(email)));
    return credentials ?? null;
  }

  async findPasswordHash(id: string): Promise<string | null> {
    const [row] = await this.db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, id));
    return row?.passwordHash ?? null;
  }

  async setPasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.db.update(users).set({ passwordHash }).where(eq(users.id, id));
  }

  /**
   * True unless `id` is an active Administrator and no other active
   * Administrator exists: guards every change that could leave nobody able
   * to manage the system. Part of the same statement as the change.
   */
  private notTheLastActiveAdministrator(id: string) {
    const others = this.db
      .select({ id: users.id })
      .from(users)
      .where(and(activeAdministrator, ne(users.id, id)));
    return sql`(not (${activeAdministrator}) or exists ${others})`;
  }

  /**
   * Where a User stands, to say why a guarded update changed nothing.
   * `null` for an unknown id or a Pending Sign-up (not a User).
   */
  private async stateOf(id: string) {
    const [row] = await this.db
      .select({
        roleId: users.roleId,
        erased: sql<boolean>`${users.erasedAt} is not null`,
        deactivated: sql<boolean>`${users.deactivatedAt} is not null`,
      })
      .from(users)
      .where(eq(users.id, id));
    return row?.roleId ? row : null;
  }

  /** A Role's display name, as the `roles` table holds it. */
  async roleName(roleId: RoleId): Promise<string> {
    const [role] = await this.db
      .select({ name: roles.name })
      .from(roles)
      .where(eq(roles.id, roleId));
    return role.name;
  }

  private now() {
    return new Date(this.clock.now());
  }
}
