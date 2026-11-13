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

const summary = z.object({
  reference: z.string().meta({ example: 'SR-PLUMB-42' }),
  title: z.string(),
  category: requestCategoryResponse,
  location: z.string(),
  status,
  priority: z.enum(PRIORITIES).optional().meta({
    description:
      'Only for Administrators and the assigned officer; absent for anyone else',
  }),
  requester: person,
  submittedAt: instant,
});

export const serviceRequestPageResponse = z.object({
  items: z.array(summary),
  page: z.int().min(1),
  pageSize: z.int().min(1).max(100),
  total: z.int().min(0).meta({ description: 'Items in the whole list' }),
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
});

export const serviceRequestDetailsResponse = summary.extend({
  description: z.string(),
  timeline: z.array(statusUpdateEntry).meta({ description: 'Oldest first' }),
});

/** A Request Category as the API shows it. */
export type RequestCategory = z.input<typeof requestCategoryResponse>;
/** A Status Update, as the timeline shows it. */
export type StatusUpdateEntry = z.input<typeof statusUpdateEntry>;
/** A Service Request as lists show it. */
export type ServiceRequestSummary = z.input<typeof summary>;
/** One page of a Service Request list, and how many the whole list holds. */
export type ServiceRequestPage = z.input<typeof serviceRequestPageResponse>;
/** A Service Request's page: its details, and its timeline oldest first. */
export type ServiceRequestDetails = z.input<
  typeof serviceRequestDetailsResponse
>;
