import { type AssignmentEndReason } from '../service-requests/service-request.types.js';
import {
  type ServiceRequestStatus,
  type Priority,
} from '../service-requests/service-request.types.js';
import { type ActivityAction } from '../users/activity-log.types.js';
import { type RoleId } from '../users/user.types.js';
import type { PhotoStage } from '../photos/photo.types.js';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const instant = () => timestamp({ withTimezone: true, mode: 'date' });

export { ROLE_IDS, type RoleId } from '../users/user.types.js';

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

export {
  ACTIVITY_ACTIONS,
  type ActivityAction,
} from '../users/activity-log.types.js';

/**
 * The Activity Log: significant actions taken on Users and Service Requests
 * (GLOSSARY.md). Each entry names exactly one of them.
 */
export const activityLog = pgTable(
  'activity_log',
  {
    /** Also the order entries happened in, when times tie. */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    occurredAt: instant().notNull(),
    /** Empty when nobody acted: an automatic change. */
    actorId: uuid().references(() => users.id),
    /** The User acted on, for an action on a User. */
    targetId: uuid().references(() => users.id),
    /** The Service Request acted on, for an action on one. */
    serviceRequestId: uuid().references(() => serviceRequests.id),
    action: text().$type<ActivityAction>().notNull(),
    details: jsonb().$type<Record<string, unknown>>(),
  },
  (table) => [
    index().on(table.occurredAt),
    index().on(table.serviceRequestId),
    check(
      'activity_log_one_subject',
      sql`num_nonnulls(${table.targetId}, ${table.serviceRequestId}) = 1`,
    ),
  ],
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

export {
  SERVICE_REQUEST_STATUSES,
  OPEN_STATUSES,
  PRIORITIES,
  type ServiceRequestStatus,
  type Priority,
} from '../service-requests/service-request.types.js';

/** Service Requests: faults on campus, reported by their Requesters (GLOSSARY.md). */
export const serviceRequests = pgTable(
  'service_requests',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Such as SR-PLUMB-42. It never changes, even if the Request Category does. */
    reference: text().notNull(),
    /** Private seed slot; never returned by the API. */
    demoKey: text().unique(),
    categoryId: text()
      .notNull()
      .references(() => requestCategories.id),
    requesterId: uuid()
      .notNull()
      .references(() => users.id),
    title: text().notNull(),
    location: text().notNull(),
    description: text().notNull(),
    status: text().$type<ServiceRequestStatus>().notNull(),
    priority: text().$type<Priority>().notNull().default('normal'),
    submittedAt: instant().notNull(),
    completedAt: instant(),
    verifiedAt: instant(),
    cancelledAt: instant(),
  },
  (table) => [
    uniqueIndex().on(table.reference),
    index().on(table.requesterId),
    index().on(table.status),
    index().on(table.categoryId),
    index().on(table.submittedAt),
  ],
);

/**
 * One counter for the rows a Service Request's timeline is built from
 * (Assignments, Status Updates and Progress Notes), so entries at the same instant keep the
 * order they happened in.
 */
export const timelineSequence = pgSequence('timeline_sequence');

const timelineId = () =>
  integer()
    .primaryKey()
    .default(sql`nextval('timeline_sequence')`);

export {
  ASSIGNMENT_END_REASONS,
  type AssignmentEndReason,
} from '../service-requests/service-request.types.js';

/**
 * Assignments: an Administrator giving a Service Request to a Maintenance
 * Officer (GLOSSARY.md). A request has at most one current Assignment, the
 * one not yet ended; earlier ones stay on record.
 */
export const assignments = pgTable(
  'assignments',
  {
    id: timelineId(),
    serviceRequestId: uuid()
      .notNull()
      .references(() => serviceRequests.id),
    officerId: uuid()
      .notNull()
      .references(() => users.id),
    assignedById: uuid()
      .notNull()
      .references(() => users.id),
    assignedAt: instant().notNull(),
    /** Empty while it's the request's current Assignment. */
    endedAt: instant(),
    endedById: uuid().references(() => users.id),
    endReason: text().$type<AssignmentEndReason>(),
  },
  (table) => [
    uniqueIndex('assignments_one_current_index')
      .on(table.serviceRequestId)
      .where(sql`${table.endedAt} is null`),
    index().on(table.officerId),
  ],
);

/** Status Updates: every change to a Service Request's Status (GLOSSARY.md). */
export const statusUpdates = pgTable(
  'status_updates',
  {
    id: timelineId(),
    serviceRequestId: uuid()
      .notNull()
      .references(() => serviceRequests.id),
    /** Empty when nobody acted: the automatic verification after 7 days. */
    actorId: uuid().references(() => users.id),
    /** Empty for the move to Submitted when the request is first submitted. */
    fromStatus: text().$type<ServiceRequestStatus>(),
    toStatus: text().$type<ServiceRequestStatus>().notNull(),
    /** Why, when the action takes one: cancelling, or Not fixed. */
    reason: text(),
    /** The officer's optional note when they complete the work. */
    note: text(),
    /**
     * The Assignment change that came with it: the Assignment it started
     * (to Assigned), or the one it ended (back to Submitted).
     */
    assignmentId: integer().references(() => assignments.id),
    occurredAt: instant().notNull(),
  },
  (table) => [index().on(table.serviceRequestId)],
);

/** Progress Notes are append-only and leave Status unchanged. */
export const progressNotes = pgTable(
  'progress_notes',
  {
    id: timelineId(),
    serviceRequestId: uuid()
      .notNull()
      .references(() => serviceRequests.id),
    authorId: uuid()
      .notNull()
      .references(() => users.id),
    text: text().notNull(),
    createdAt: instant().notNull(),
  },
  (table) => [index().on(table.serviceRequestId)],
);

/** Pending uploads and attached Photos retain both keys so failed changes remain cleanable. */
export const photos = pgTable(
  'photos',
  {
    id: uuid().primaryKey(),
    uploadedById: uuid()
      .notNull()
      .references(() => users.id),
    serviceRequestId: uuid().references(() => serviceRequests.id),
    stage: text().$type<PhotoStage>(),
    uploadKey: text().notNull().unique(),
    storageKey: text().notNull().unique(),
    contentType: text().notNull(),
    size: integer().notNull(),
    uploadedAt: instant().notNull(),
    attachedAt: instant(),
    finalizedAt: instant(),
    unattachedSince: instant(),
    uploadDeletedAt: instant(),
  },
  (table) => [
    index().on(table.serviceRequestId),
    index().on(table.unattachedSince),
    index().on(table.uploadedAt),
    check(
      'photos_attachment',
      sql`(${table.serviceRequestId} is null and ${table.stage} is null and ${table.attachedAt} is null and ${table.unattachedSince} is not null) or (${table.serviceRequestId} is not null and ${table.stage} is not null and ${table.attachedAt} is not null and ${table.unattachedSince} is null)`,
    ),
  ],
);
