import type { Database } from '../database/database.js';

/**
 * Runs officer departures inside the User change's transaction so their
 * work is handed back atomically. The Users-owned contract keeps source
 * dependencies directed from Service Requests to Users.
 */
export abstract class OfficerDepartures {
  /**
   * Hands back Assigned and In Progress work in the transaction changing
   * the User, attributed to `actorId`, while preserving Completed Assignments.
   */
  abstract handBackAssignmentsOf(
    db: Database,
    officerId: string,
    actorId: string,
  ): Promise<void>;
}
