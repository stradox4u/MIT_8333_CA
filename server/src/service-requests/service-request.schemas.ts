import { z } from 'zod';
import { PRIORITIES, SERVICE_REQUEST_STATUSES } from '../database/schema.js';
import { userId } from '../users/user.schemas.js';

/** Zod pieces for Service Request data (docs/service-requests.md, Validation). */

export const title = z.string().trim().min(3).max(120);

export const location = z.string().trim().min(2).max(200);

export const description = z.string().trim().min(10).max(5000);

/** A Request Category's id, such as `plumbing`. Whether it exists is checked on use. */
export const categoryId = z.string().min(1).max(64);

export const status = z.enum(SERVICE_REQUEST_STATUSES);

/** A list's Status filter: any Status, or `open` for Submitted, Assigned or In Progress. */
export const statusFilter = z.enum([...SERVICE_REQUEST_STATUSES, 'open']).meta({
  description:
    'Any Status, or `open`: Submitted, Assigned or In Progress, so the work hasn’t finished',
});
export type StatusFilter = z.infer<typeof statusFilter>;

/** How the API addresses a Service Request, such as SR-PLUMB-42. */
export const referenceParam = z
  .string()
  .max(64)
  .regex(/^SR-[A-Z]+-[1-9][0-9]*$/, 'is not a Reference, such as SR-PLUMB-42');

export const submitBody = z.object({
  title,
  categoryId,
  location,
  description,
});

export const assignBody = z.object({
  /** An active Maintenance Officer's id. Whether they are one is checked on use. */
  officerId: userId,
});

export const completeBody = z
  .object({
    /** The officer's note on the finished work, kept on that Status Update. */
    note: z.string().trim().min(1).max(2000).optional(),
  })
  .optional();

export const reasonBody = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const editBody = submitBody
  .partial()
  .strict()
  .refine(
    (body) => Object.keys(body).length > 0,
    'Provide at least one field to edit',
  );

export const progressNoteBody = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const priorityBody = z.object({ priority: z.enum(PRIORITIES) });

/**
 * Which Service Requests a list shows: those the User raised (`requested`),
 * those they've held an Assignment for (`assigned`, Maintenance Officers),
 * or every one (`all`, Administrators).
 */
export const listScope = z.enum(['requested', 'assigned', 'all']);
export type ListScopeName = z.infer<typeof listScope>;

export const listQuery = z.object({
  scope: listScope,
  status: statusFilter.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
