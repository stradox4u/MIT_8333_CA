import { z } from 'zod';
import { roleId } from '../users/user.schemas.js';
import { sessionId } from './auth.schemas.js';

/** The JSON identity includes nullable fields while sign-up is pending. */
export const currentIdentityResponse = z.object({
  id: z.string().meta({ format: 'uuid' }),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  role: roleId.nullable(),
  signUpComplete: z.boolean(),
  hasPassword: z.boolean(),
});

/** Session dates are serialized to ISO strings, never cookie tokens. */
export const sessionResponse = z.object({
  id: sessionId,
  userAgent: z.string().nullable(),
  signedInAt: z.string().meta({ format: 'date-time' }),
  lastActiveAt: z.string().meta({ format: 'date-time' }),
  current: z.boolean(),
});

export const sessionsResponse = z.array(sessionResponse);
