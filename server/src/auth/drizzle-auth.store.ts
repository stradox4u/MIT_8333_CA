import { Injectable, Optional } from '@nestjs/common';
import { InjectDatabase } from '../database/database.js';
import type {
  MagicLinkRecord,
  MagicLinkStore,
  OidcStateStore,
  OidcTransaction,
  SessionRecord,
  SessionStore,
} from '@nestjs/authentication';
import { and, desc, eq, inArray, lt, lte } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Database } from '../database/database.js';
import { googleSignIns, sessions, signInLinks } from '../database/schema.js';

export interface DrizzleAuthStoreOptions {
  /**
   * The most unused Sign-in Links and Google sign-ins in progress kept (per
   * kind). Anyone can start either, so the tables must stay bounded.
   */
  maxPending?: number;
}

/**
 * Postgres storage for the auth package's sessions, Sign-in Links and Google
 * sign-ins in progress. Each method follows the rule documented on its
 * interface; `authenticationStoreContract()` checks them (see the spec).
 */
@Injectable()
export class DrizzleAuthStore
  implements SessionStore, MagicLinkStore, OidcStateStore
{
  private readonly maxPending: number;

  constructor(
    @InjectDatabase() private readonly db: Database,
    @Optional() { maxPending = 10_000 }: DrizzleAuthStoreOptions = {},
  ) {
    this.maxPending = maxPending;
  }

  // Sessions

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id));
    if (!row) {
      return undefined;
    }
    // The package moves `lastActiveAt` to now before `SessionAuth.validate()`
    // runs, which needs the stored value for the 1-hour idle rule.
    return {
      ...toSessionRecord(row),
      extra: { lastActiveAt: new Date(row.lastActiveAt) },
    };
  }

  async createSession(record: SessionRecord): Promise<void> {
    await this.db.insert(sessions).values({
      id: record.id,
      userId: record.userId,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      lastActiveAt: record.lastActiveAt,
      mfa: record.mfa ?? null,
      metadata: record.metadata ?? null,
    });
    await this.db
      .delete(sessions)
      .where(lte(sessions.expiresAt, record.createdAt));
  }

  async touchSession(id: string, lastActiveAt: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastActiveAt })
      .where(and(eq(sessions.id, id), lt(sessions.lastActiveAt, lastActiveAt)));
  }

  async deleteSession(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(sessions)
      .where(eq(sessions.id, id))
      .returning({ id: sessions.id });
    return deleted.length > 0;
  }

  async listUserSessions(userId: string): Promise<SessionRecord[]> {
    const rows = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId));
    return rows.map(toSessionRecord);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.userId, userId));
  }

  // Sign-in Links

  async saveMagicLink(record: MagicLinkRecord): Promise<void> {
    await this.db.insert(signInLinks).values({
      id: record.id,
      email: record.email,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      redirectTo: record.redirectTo ?? null,
    });
    await this.keepBounded(
      signInLinks,
      signInLinks.id,
      signInLinks.expiresAt,
      record.createdAt,
    );
  }

  async consumeMagicLink(id: string): Promise<MagicLinkRecord | undefined> {
    const [row] = await this.db
      .delete(signInLinks)
      .where(eq(signInLinks.id, id))
      .returning();
    if (!row) {
      return undefined;
    }
    return withoutNulls({
      id: row.id,
      email: row.email,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      redirectTo: row.redirectTo,
    });
  }

  // Google sign-ins in progress

  async saveOidcState(transaction: OidcTransaction): Promise<void> {
    await this.db.insert(googleSignIns).values({
      state: transaction.state,
      provider: transaction.provider,
      nonce: transaction.nonce ?? null,
      codeVerifier: transaction.codeVerifier,
      redirectTo: transaction.redirectTo ?? null,
      createdAt: transaction.createdAt,
      expiresAt: transaction.expiresAt,
      linkUserId: transaction.link?.userId ?? null,
      linkSessionId: transaction.link?.sessionId ?? null,
    });
    await this.keepBounded(
      googleSignIns,
      googleSignIns.state,
      googleSignIns.expiresAt,
      transaction.createdAt,
    );
  }

  async consumeOidcState(state: string): Promise<OidcTransaction | undefined> {
    const [row] = await this.db
      .delete(googleSignIns)
      .where(eq(googleSignIns.state, state))
      .returning();
    if (!row) {
      return undefined;
    }
    const { linkUserId, linkSessionId, ...rest } = row;
    return withoutNulls({
      ...rest,
      link:
        linkUserId && linkSessionId
          ? { userId: linkUserId, sessionId: linkSessionId }
          : null,
    });
  }

  /**
   * Drops rows that expired by `now`, then, past `maxPending`, the ones that
   * expire first.
   */
  private async keepBounded(
    table: PgTable,
    key: PgColumn,
    expiresAt: PgColumn,
    now: Date,
  ) {
    await this.db.delete(table).where(lte(expiresAt, now));
    const overflow = this.db
      .select({ key })
      .from(table)
      .orderBy(desc(expiresAt))
      .offset(this.maxPending);
    await this.db.delete(table).where(inArray(key, overflow));
  }
}

function toSessionRecord(row: typeof sessions.$inferSelect): SessionRecord {
  return withoutNulls({
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    lastActiveAt: row.lastActiveAt,
    mfa: row.mfa,
    metadata: row.metadata,
  });
}

/** The package wants optional fields absent, never `null`. */
function withoutNulls<T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]: Exclude<T[K], null> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== null),
  ) as { [K in keyof T]: Exclude<T[K], null> };
}
