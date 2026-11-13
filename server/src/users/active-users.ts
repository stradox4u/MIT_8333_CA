import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { type RoleId, users } from '../database/schema.js';

/**
 * An active User of `role`: one who has signed in at least once (a pending
 * Invitation doesn't count), and is neither deactivated nor erased.
 */
export const activeWithRole = (role: RoleId) =>
  and(
    eq(users.roleId, role),
    isNotNull(users.emailVerifiedAt),
    isNull(users.deactivatedAt),
    isNull(users.erasedAt),
  );
