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

const submittedDay = z.iso
  .date()
  .refine((day) => !day.startsWith('0000-'), 'Year must be 0001–9999');

export const listQuery = z
  .object({
    scope: listScope,
    status: statusFilter.optional(),
    search: z.string().trim().max(200).optional().meta({
      description:
        'Case-insensitive literal substring of Reference/title; scope=all also searches location and Requester display name. Whitespace-only means no search.',
    }),
    category: z
      .enum([
        'electrical',
        'plumbing',
        'furniture',
        'network',
        'classroom_equipment',
        'other',
      ])
      .optional(),
    priority: z.enum(PRIORITIES).optional(),
    officerId: userId.toLowerCase().optional().meta({
      description:
        'Current officer UUID. scope=all, or scope=assigned with your own UUID to restrict to current Assignments.',
    }),
    submittedFrom: submittedDay.optional().meta({
      description:
        'Inclusive UTC submitted day, YYYY-MM-DD (0001–9999); scope=all only',
    }),
    submittedTo: submittedDay.optional().meta({
      description:
        'Inclusive UTC submitted day, YYYY-MM-DD (0001–9999); scope=all only',
    }),
    sort: z.enum(['newest', 'priority']).default('newest').meta({
      description:
        'newest: Submitted descending, id descending. priority: Urgent to Low, then oldest Submitted and id ascending; scope=all, or assigned with officerId=self only.',
    }),
    page: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .pipe(z.coerce.number<string>().int().min(1))
      .default(1),
    pageSize: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .pipe(z.coerce.number<string>().int().min(1).max(100))
      .default(20),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      typeof query.page === 'number' &&
      typeof query.pageSize === 'number' &&
      !Number.isSafeInteger((query.page - 1) * query.pageSize)
    )
      context.addIssue({
        code: 'custom',
        path: ['page'],
        message: 'Page offset is too large',
      });
    if (query.scope !== 'all') {
      for (const field of [
        'category',
        'priority',
        'submittedFrom',
        'submittedTo',
      ] as const) {
        if (query[field] !== undefined)
          context.addIssue({
            code: 'custom',
            path: [field],
            message: 'Only available with scope=all',
          });
      }
      if (query.officerId && query.scope !== 'assigned')
        context.addIssue({
          code: 'custom',
          path: ['officerId'],
          message: 'Only available with scope=all or assigned',
        });
      if (
        query.sort === 'priority' &&
        !(query.scope === 'assigned' && query.officerId)
      )
        context.addIssue({
          code: 'custom',
          path: ['sort'],
          message:
            'Priority ordering needs scope=all or your current Assignments (officerId)',
        });
    }
    if (
      query.submittedFrom &&
      query.submittedTo &&
      query.submittedFrom > query.submittedTo
    )
      context.addIssue({
        code: 'custom',
        path: ['submittedTo'],
        message: 'Must not precede submittedFrom',
      });
  });

/** Dashboard counts use the same visibility scopes, without list filters. */
export const summaryQuery = z.object({ scope: listScope }).strict();
