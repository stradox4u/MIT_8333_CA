import type { Database } from '../database/database.js';

/**
 * What becomes of a Maintenance Officer's work when they stop being one:
 * demoted, deactivated or erased. `UsersRepository` runs it inside the
 * transaction that changes the User, so the two can't come apart.
 *
 * The Service Requests module provides it. Declaring it here lets this
 * module ask for it without depending on that one, which depends on this.
 */
export abstract class OfficerDepartures {
  /**
   * Ends the officer's Assignments on Assigned and In Progress requests,
   * handing those back to Submitted. Completed ones keep their Assignment.
   * `actorId` is whoever changed the User, the officer included.
   */
  abstract handBackAssignmentsOf(
    db: Database,
    officerId: string,
    actorId: string,
  ): Promise<void>;
}
