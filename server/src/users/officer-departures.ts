import type { RepositoryTransaction } from '../persistence/transaction.js';

/** What to do once the User change commits, such as sending its emails. */
export type AfterCommit = () => void;

/**
 * Runs officer departures inside the User change's transaction so their
 * work is handed back atomically. The Users-owned contract keeps source
 * dependencies directed from Service Requests to Users.
 */
export abstract class OfficerDepartures {
  /**
   * Hands back Assigned and In Progress work in the transaction changing
   * the User, attributed to `actorId`, while preserving Completed Assignments.
   * Call the answer only after that transaction commits.
   */
  abstract handBackAssignmentsOf(
    transaction: RepositoryTransaction,
    officerId: string,
    actorId: string,
  ): Promise<AfterCommit>;
}
