import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';

/** What a signed-in person may do with their own account. */
@Policy()
export class AccountPolicy {
  /**
   * Anything beyond finishing sign-up and signing out needs a User: a
   * Pending Sign-up has no Role yet, and is refused.
   */
  manage(user: User | null) {
    return user !== null && user.roleId !== null;
  }
}
