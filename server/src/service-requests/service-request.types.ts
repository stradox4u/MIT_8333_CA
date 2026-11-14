export const SERVICE_REQUEST_STATUSES = [
  'submitted',
  'assigned',
  'in_progress',
  'completed',
  'verified',
  'cancelled',
] as const;
export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

/** Open: the work on it hasn't finished (GLOSSARY.md). */
export const OPEN_STATUSES: ServiceRequestStatus[] = [
  'submitted',
  'assigned',
  'in_progress',
];

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const ASSIGNMENT_END_REASONS = [
  'reassigned',
  'unassigned',
  'not_fixed',
  'cancelled',
  /** The officer was demoted, deactivated or erased. */
  'officer_left',
] as const;
export type AssignmentEndReason = (typeof ASSIGNMENT_END_REASONS)[number];

/** The current values needed to compose a notification after commit. */
export interface NotificationRequest {
  reference: string;
  title: string;
  location: string;
  category: string;
  priority: Priority;
}

export interface NewServiceRequest {
  requesterId: string;
  title: string;
  categoryId: string;
  location: string;
  description: string;
}

export type DetailsEdits = Partial<Omit<NewServiceRequest, 'requesterId'>>;

/** A Service Request locked for a change, with its current Assignment. */
export interface LockedServiceRequest {
  id: string;
  reference: string;
  requesterId: string;
  status: ServiceRequestStatus;
  completedAt: Date | null;
  priority: Priority;
  assignment: { id: number; officerId: string } | null;
}
