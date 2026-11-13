import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const instant = () => timestamp({ withTimezone: true, mode: 'date' });

export const ROLE_IDS = [
  'student',
  'staff',
  'maintenance_officer',
  'administrator',
] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/** Reference data: the four Roles, inserted by a migration. */
export const roles = pgTable('roles', {
  id: text().$type<RoleId>().primaryKey(),
  name: text().notNull(),
});

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  /** Trimmed and lowercased. */
  email: text().unique(),
  firstName: text(),
  lastName: text(),
  /** Absent while the account is a Pending Sign-up. */
  roleId: text()
    .$type<RoleId>()
    .references(() => roles.id),
  /** scrypt, from the auth package's `PasswordHasher`. Passwords are optional (ADR-0006). */
  passwordHash: text(),
  createdAt: instant().notNull().defaultNow(),
  /**
   * When the owner first proved the address (a Sign-in Link or Google). Absent
   * for an invited account that has never signed in: a pending Invitation.
   */
  emailVerifiedAt: instant(),
  deactivatedAt: instant(),
  erasedAt: instant(),
});

// Storage for @nestjs/authentication (ADR-0001, ADR-0006). The package owns
// these rows' rules; see DrizzleAuthStore. `user_id` is text, without a
// foreign key, as the package's store contract expects.

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 of the cookie token. */
    id: text().primaryKey(),
    userId: text().notNull(),
    createdAt: instant().notNull(),
    expiresAt: instant().notNull(),
    lastActiveAt: instant().notNull(),
    mfa: text().$type<'pending' | 'verified'>(),
    metadata: jsonb().$type<Record<string, unknown>>(),
  },
  (table) => [index().on(table.userId), index().on(table.expiresAt)],
);

export const signInLinks = pgTable(
  'sign_in_links',
  {
    /** SHA-256 of the link's token. */
    id: text().primaryKey(),
    email: text().notNull(),
    createdAt: instant().notNull(),
    expiresAt: instant().notNull(),
    redirectTo: text(),
  },
  (table) => [index().on(table.expiresAt)],
);

export const googleSignIns = pgTable(
  'google_sign_ins',
  {
    state: text().primaryKey(),
    provider: text().notNull(),
    nonce: text(),
    codeVerifier: text().notNull(),
    redirectTo: text(),
    createdAt: instant().notNull(),
    expiresAt: instant().notNull(),
    linkUserId: text(),
    linkSessionId: text(),
  },
  (table) => [index().on(table.expiresAt)],
);

/** Fixed-window counters behind every rate limit (see RateLimitCounters). */
export const rateLimits = pgTable(
  'rate_limits',
  {
    /** The counter's key, hashed: a throttler's, or a password-attempt key. */
    key: text().primaryKey(),
    hits: integer().notNull(),
    windowEndsAt: instant().notNull(),
    blockedUntil: instant(),
  },
  (table) => [index().on(table.windowEndsAt)],
);

export const ACTIVITY_ACTIONS = [
  'invited',
  'role_changed',
  'deactivated',
  'reactivated',
  'erased',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** The Activity Log: significant actions taken on Users (GLOSSARY.md). */
export const activityLog = pgTable(
  'activity_log',
  {
    /** Also the order entries happened in, when times tie. */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: instant().notNull(),
    actorId: uuid()
      .notNull()
      .references(() => users.id),
    targetId: uuid()
      .notNull()
      .references(() => users.id),
    action: text().$type<ActivityAction>().notNull(),
    details: jsonb().$type<Record<string, unknown>>(),
  },
  (table) => [index().on(table.occurredAt)],
);

/**
 * Google accounts linked to Users, by Google's stable account id (`sub`),
 * never by address: addresses change, ids don't.
 */
export const googleIdentities = pgTable(
  'google_identities',
  {
    subject: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    linkedAt: instant().notNull(),
  },
  (table) => [index().on(table.userId)],
);

/**
 * Reference data: the six Request Categories, inserted by a migration. Each
 * numbers its own References: `last_number` is the latest one it issued.
 */
export const requestCategories = pgTable('request_categories', {
  /** Such as `plumbing`. */
  id: text().primaryKey(),
  name: text().notNull(),
  /** The middle of its References, such as `PLUMB` in SR-PLUMB-42. */
  code: text().notNull().unique(),
  lastNumber: integer().notNull().default(0),
  sortOrder: integer().notNull(),
});
