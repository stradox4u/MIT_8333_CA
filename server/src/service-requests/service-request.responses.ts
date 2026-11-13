import { z } from 'zod';
import { PRIORITIES } from '../database/schema.js';
import { status } from './service-request.schemas.js';

/**
 * What the Service Request routes answer: the one definition of each shape.
 * Swagger documents a schema's output, which is the JSON sent. The types
 * below are its input, which is what the server builds before sending, with
 * `Date`s where the JSON has ISO strings. The end-to-end tests pin the
 * exact shapes.
 */

/**
 * A `Date` on the server, and an ISO 8601 string in the JSON, as
 * `JSON.stringify` writes it. Documented by format only: the pattern Zod
 * would add says nothing a reader needs.
 */
const instant = z.codec(z.date(), z.string().meta({ format: 'date-time' }), {
  decode: (date) => date.toISOString(),
  encode: (text) => new Date(text),
});

const person = z.object({
  id: z.string().meta({ format: 'uuid' }),
  name: z.string().meta({ description: '"First Last", or "Erased user"' }),
});

export const requestCategoryResponse = z.object({
  id: z.string().meta({ example: 'plumbing' }),
  name: z.string().meta({ example: 'Plumbing' }),
  code: z.string().meta({ example: 'PLUMB' }),
});

export const submittedResponse = z.object({
  reference: z.string().meta({ example: 'SR-PLUMB-42' }),
});

/** The request's current Assignment. */
const currentAssignment = z.object({
  officer: person,
  assignedAt: instant,
});

/** A Service Request as the server holds it for a list, Priority and all. */
const summary = z.object({
  reference: z.string().meta({ example: 'SR-PLUMB-42' }),
  title: z.string(),
  category: requestCategoryResponse,
  location: z.string(),
  status,
  priority: z.enum(PRIORITIES),
  requester: person,
  submittedAt: instant,
  assignment: currentAssignment
    .nullable()
    .meta({ description: 'The current Assignment; empty when it has none' }),
});

const statusUpdateEntry = z.object({
  type: z.literal('status_update'),
  occurredAt: instant,
  actor: person.nullable().meta({
    description: 'Empty when nobody acted: automatically, after 7 days',
  }),
  fromStatus: status
    .nullable()
    .meta({ description: 'Empty when the request was first submitted' }),
  toStatus: status,
  reason: z.string().nullable(),
  note: z
    .string()
    .nullable()
    .meta({ description: 'The officer’s note, when they completed it' }),
});

const assignmentEntry = z.object({
  type: z.literal('assignment'),
  occurredAt: instant,
  actor: person.nullable(),
  change: z
    .enum(['assigned', 'reassigned', 'unassigned', 'officer_left'])
    .meta({
      description:
        '`officer_left`: the officer was demoted, deactivated or erased',
    }),
  officer: person.meta({
    description:
      'Who was given it, or (unassigned, officer_left) whose Assignment ended',
  }),
  previousOfficer: person
    .nullable()
    .meta({ description: 'Whom it was taken from, when reassigned' }),
  statusUpdate: z
    .object({ fromStatus: status, toStatus: status })
    .nullable()
    .meta({ description: 'The Status Update the same action made, if any' }),
});

const timelineEntry = z.discriminatedUnion('type', [
  statusUpdateEntry,
  assignmentEntry,
]);

/** A Service Request's page as the server holds it. */
const details = summary.extend({
  description: z.string(),
  timeline: z.array(timelineEntry).meta({ description: 'Oldest first' }),
});

const pageOf = <Item extends z.ZodType>(item: Item) =>
  z.object({
    items: z.array(item),
    page: z.int().min(1),
    pageSize: z.int().min(1).max(100),
    total: z.int().min(0).meta({ description: 'Items in the whole list' }),
  });

/** Priority as answered: only to some Users, and left out for the rest. */
const shownPriority = z.enum(PRIORITIES).optional().meta({
  description:
    'Only for Administrators and the request’s current officer; absent for anyone else',
});

export const serviceRequestPageResponse = pageOf(
  summary.extend({ priority: shownPriority }),
);

export const serviceRequestDetailsResponse = details.extend({
  priority: shownPriority,
});

export const maintenanceOfficerResponse = person.extend({
  openAssignments: z.int().min(0).meta({
    description: 'Requests they hold that are Assigned or In Progress',
  }),
});

/** A Request Category as the API shows it. */
export type RequestCategory = z.input<typeof requestCategoryResponse>;
/** A User as Service Requests show them: "First Last", or "Erased user". */
export type Person = z.input<typeof person>;
/** One entry of a Service Request's timeline. */
export type TimelineEntry = z.input<typeof timelineEntry>;
/** A Service Request as lists show it, before Priority is hidden from some. */
export type ServiceRequestSummary = z.input<typeof summary>;
/** One page of a Service Request list, and how many the whole list holds. */
export type ServiceRequestPage = z.input<
  ReturnType<typeof pageOf<typeof summary>>
>;
/** A Service Request's page, before Priority is hidden from some. */
export type ServiceRequestDetails = z.input<typeof details>;
/** An active Maintenance Officer, with their count of Open Assignments. */
export type MaintenanceOfficer = z.input<typeof maintenanceOfficerResponse>;
