import type { Priority, ServiceRequestStatus } from '../database/schema.js';

/** How people see each Status, as GLOSSARY.md names them. */
export const STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  submitted: 'Submitted',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  cancelled: 'Cancelled',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};
