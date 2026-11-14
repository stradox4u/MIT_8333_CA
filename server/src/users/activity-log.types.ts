export const ACTIVITY_ACTIONS = [
  // On Users:
  'invited',
  'role_changed',
  'deactivated',
  'reactivated',
  'erased',
  // On Service Requests:
  'status_changed',
  'assigned',
  'reassigned',
  'unassigned',
  'officer_left',
  'details_changed',
  'priority_changed',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** One entry: who did what, to exactly one User or Service Request. */
export type ActivityEntry = {
  /** `null` when nobody acted: an automatic change. */
  actorId: string | null;
  action: ActivityAction;
  details?: Record<string, unknown>;
} & (
  | { targetId: string; serviceRequestId?: never }
  | { serviceRequestId: string; targetId?: never }
);
