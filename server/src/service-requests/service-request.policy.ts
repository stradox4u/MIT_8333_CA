import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';

/**
 * Who may do what with Service Requests (docs/service-requests.md). Every
 * Role is granted explicitly: being an Administrator grants nothing by
 * itself (ADR-0003).
 */
@Policy()
export class ServiceRequestPolicy {
  /**
   * Submitting Service Requests and following one's own: any User. A
   * Pending Sign-up has no Role yet, and is refused.
   */
  use(user: User | null) {
    return user !== null && user.roleId !== null;
  }

  /**
   * Seeing one Service Request: its Requester and Administrators. Anyone
   * else is told it doesn't exist (404), so nobody learns that it does.
   */
  view(user: User, request: { requester: { id: string } }) {
    return request.requester.id === user.id || user.roleId === 'administrator';
  }
}
