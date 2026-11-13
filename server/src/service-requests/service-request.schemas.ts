import { z } from 'zod';

/** Zod pieces for Service Request data (docs/service-requests.md, Validation). */

export const title = z.string().trim().min(3).max(120);

export const location = z.string().trim().min(2).max(200);

export const description = z.string().trim().min(10).max(5000);

/** A Request Category's id, such as `plumbing`. Whether it exists is checked on use. */
export const categoryId = z.string().min(1).max(64);

export const submitBody = z.object({
  title,
  categoryId,
  location,
  description,
});
