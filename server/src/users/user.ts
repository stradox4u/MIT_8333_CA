import type { RoleId } from './user.types.js';

/**
 * A User as the rest of the app sees it. The password hash never leaves
 * `UsersRepository`; only whether there is one.
 */
export interface User {
  id: string;
  /** `null` once the User is erased. */
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  /** `null` while the account is a Pending Sign-up. */
  roleId: RoleId | null;
  hasPassword: boolean;
}
