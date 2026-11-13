import { z } from 'zod';
import { SERVICE_REQUEST_STATUSES } from '../database/schema.js';

/** Zod pieces for Service Request data (docs/service-requests.md, Validation). */

export const title = z.string().trim().min(3).max(120);

export const location = z.string().trim().min(2).max(200);

export const description = z.string().trim().min(10).max(5000);

/** A Request Category's id, such as `plumbing`. Whether it exists is checked on use. */
export const categoryId = z.string().min(1).max(64);

export const status = z.enum(SERVICE_REQUEST_STATUSES);

/** A list's Status filter: any Status, or `open` for Submitted, Assigned or In Progress. */
export const statusFilter = z.enum([...SERVICE_REQUEST_STATUSES, 'open']);
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

/** Which Service Requests a list shows. `assigned` and `all` come in slice 2. */
const scope = z.literal('requested', {
  error: 'must be requested: the assigned and all scopes aren’t available yet',
});

export const listQuery = z.object({
  scope,
  status: statusFilter.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
