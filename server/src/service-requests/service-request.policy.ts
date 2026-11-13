import { Policy } from '@nestjs/authorization';
import type { User } from '../users/user.js';

/** Who is connected to a Service Request: what its access rules turn on. */
export interface ServiceRequestAccess {
  requesterId: string;
  /** The officer of its current Assignment, if it has one. */
  currentOfficerId: string | null;
  /** Every officer who has ever held an Assignment for it, the current one included. */
  officerIds: string[];
}

const isOfficer = (user: User) => user.roleId === 'maintenance_officer';
const isAdministrator = (user: User | null) => user?.roleId === 'administrator';

/**
 * Who may do what with Service Requests (docs/service-requests.md). Every
 * Role is granted explicitly: being an Administrator grants nothing by
 * itself, so it never grants an officer's actions (ADR-0003).
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
   * Administrators managing Service Requests: assigning and unassigning
   * them, listing them all, and choosing among the officers.
   */
  manage(user: User | null) {
    return isAdministrator(user);
  }

  /** Listing the Service Requests one has held an Assignment for. */
  listAssigned(user: User | null) {
    return user !== null && isOfficer(user);
  }

  /**
   * Seeing one Service Request: its Requester, Administrators, and any
   * Maintenance Officer who has ever held an Assignment for it. Anyone else
   * is told it doesn't exist (404), so nobody learns that it does.
   */
  view(user: User, request: ServiceRequestAccess) {
    return (
      request.requesterId === user.id ||
      isAdministrator(user) ||
      (isOfficer(user) && request.officerIds.includes(user.id))
    );
  }

  /** Starting and completing the work: only the request's current officer. */
  work(user: User, request: Pick<ServiceRequestAccess, 'currentOfficerId'>) {
    return isOfficer(user) && request.currentOfficerId === user.id;
  }

  /** Progress Notes: the Requester, current officer and Administrators. */
  addProgressNote(user: User, request: ServiceRequestAccess) {
    return (
      request.requesterId === user.id ||
      isAdministrator(user) ||
      this.work(user, request)
    );
  }

  /** The Requester or an Administrator confirms Completed work is fixed. */
  verify(user: User, request: Pick<ServiceRequestAccess, 'requesterId'>) {
    return request.requesterId === user.id || isAdministrator(user);
  }

  /** Only the Requester can say the fault was not fixed. */
  notFixed(user: User, request: Pick<ServiceRequestAccess, 'requesterId'>) {
    return request.requesterId === user.id;
  }

  /** Requesters withdraw their own reports; Administrators can cancel Open work. */
  cancel(user: User, request: Pick<ServiceRequestAccess, 'requesterId'>) {
    return request.requesterId === user.id || isAdministrator(user);
  }

  /** Requesters edit their reports; Administrators correct category and location. */
  edit(user: User, request: Pick<ServiceRequestAccess, 'requesterId'>) {
    return request.requesterId === user.id || isAdministrator(user);
  }

  /**
   * Seeing a Service Request's Priority: Administrators and its current
   * officer. Requesters don't, even for their own; nor do officers it was
   * taken away from.
   */
  seePriority(
    user: User,
    request: Pick<ServiceRequestAccess, 'currentOfficerId'>,
  ) {
    return isAdministrator(user) || this.work(user, request);
  }
}
