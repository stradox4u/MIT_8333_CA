import { Policy } from '@nestjs/authorization';
import type { User } from './user.js';

/** Who may manage other Users' accounts. */
@Policy()
export class UserManagementPolicy {
  /** Inviting, listing, changing Roles, deactivating and erasing Users. */
  manage(user: User | null) {
    return user?.roleId === 'administrator';
  }
}
