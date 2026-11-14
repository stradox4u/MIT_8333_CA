import type { ServiceRequestSummary } from './service-request.responses.js';

type ReportRow = ServiceRequestSummary & {
  completedAt: Date | null;
  verifiedAt: Date | null;
};

const priorities = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};
const statuses = {
  submitted: 'Submitted',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  cancelled: 'Cancelled',
};

/** Prefix formula-like cells before CSV quoting so spreadsheet apps keep text. */
const cell = (value: string) => {
  const text = /^(?:\s*[=+@-]|[\t\r\n])/u.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Only the named report columns leave this boundary. */
export function serviceRequestsCsv(rows: ReportRow[]) {
  const header = [
    'Reference',
    'title',
    'Request Category',
    'location',
    'Priority',
    'Status',
    'Requester',
    'current officer',
    'Submitted',
    'Completed',
    'Verified',
  ];
  return [
    header,
    ...rows.map((row) => [
      row.reference,
      row.title,
      row.category.name,
      row.location,
      priorities[row.priority],
      statuses[row.status],
      row.requester.name,
      row.assignment?.officer.name ?? '',
      row.submittedAt.toISOString(),
      row.completedAt?.toISOString() ?? '',
      row.verifiedAt?.toISOString() ?? '',
    ]),
  ]
    .map((row) => row.map(cell).join(',') + '\r\n')
    .join('');
}
