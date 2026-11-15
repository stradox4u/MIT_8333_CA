import { z } from 'zod';
import { ACTIVITY_ACTIONS } from './activity-log.types.js';
import { roleId } from './user.schemas.js';

/** Dates below describe the serialized JSON, not database Date objects. */
const instant = z.string().meta({ format: 'date-time' });
const person = z.object({
  id: z.string().meta({ format: 'uuid' }),
  name: z.string().meta({ description: '"First Last", or "Erased user"' }),
});

export const managedUserResponse = z.object({
  id: z.string().meta({ format: 'uuid' }),
  name: z.string(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  role: roleId,
  status: z.enum(['invited', 'active', 'deactivated', 'erased']),
  createdAt: instant,
});

export const managedUsersResponse = z.array(managedUserResponse);

export const activityLogResponse = z.array(
  z.object({
    id: z.int().positive(),
    occurredAt: instant,
    action: z.enum(ACTIVITY_ACTIONS),
    details: z.record(z.string(), z.unknown()).nullable(),
    actor: person.nullable(),
    target: person.nullable(),
    serviceRequest: z.object({ reference: z.string() }).nullable(),
  }),
);
