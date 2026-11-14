import type {
  AssignmentEndReason,
  ServiceRequestStatus,
} from './service-request.types.js';

export const SERVICE_REQUESTS_COMMITTED = 'service-requests.committed';

/** What one committed change did to one Service Request, for its emails. */
export interface ServiceRequestChange {
  reference: string;
  requesterId: string;
  /** Who made the change; `null` for the daily job. Never emailed about it. */
  actorId: string | null;
  /** The Status Update it recorded, if any, with its note or reason. */
  moved?: {
    from: ServiceRequestStatus | null;
    to: ServiceRequestStatus;
    note?: string | null;
    reason?: string | null;
  };
  /** The officer it gave an Assignment. */
  assignedTo?: string;
  /** The officer whose Assignment on Open work it ended, and why. */
  ended?: {
    officerId: string;
    why: Exclude<AssignmentEndReason, 'not_fixed'>;
  };
  /** The officer a Not fixed answer returned the work to. */
  returnedTo?: string;
}
