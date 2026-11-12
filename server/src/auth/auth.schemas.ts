import { z } from 'zod';

/** Zod pieces for signing in, shared by every route that takes them. */

/**
 * An address typed at sign-in. Deliberately lenient: a malformed address
 * gets the same answer as an unknown one, so nothing about accounts leaks.
 */
export const signInEmail = z.string().max(320);

export const keepSignedIn = z.boolean().default(false);

/**
 * The same choice as a query parameter (Google sign-in): `true`, `false`,
 * or empty or absent for no.
 */
export const keepSignedInQuery = z
  .enum(['true', 'false', ''])
  .optional()
  .transform((value) => value === 'true');

const length = (value: string) => [...value].length;

/**
 * The one rule set for every password a User sets (ADR-0006): 12–128
 * characters, with at least one uppercase letter, one lowercase letter, one
 * digit and one special character (anything that isn't a letter or digit,
 * spaces included). Letters and digits from any script count.
 */
export const newPassword = z
  .string()
  .refine((value) => length(value) >= 12, 'must be at least 12 characters')
  .refine((value) => length(value) <= 128, 'must be at most 128 characters')
  .refine((value) => /\p{Lu}/u.test(value), 'needs an uppercase letter')
  .refine((value) => /\p{Ll}/u.test(value), 'needs a lowercase letter')
  .refine((value) => /\p{Nd}/u.test(value), 'needs a digit')
  .refine((value) => /[^\p{L}\p{N}]/u.test(value), 'needs a special character');

/** A password offered to sign in or to confirm it's you; never a new one. */
export const offeredPassword = z.string().max(1024);

/** Fresh authentication; needed unless the User signed in in the last 10 minutes. */
export const currentPassword = offeredPassword.optional();

export const signInLinkToken = z.string().min(1).max(512);

/** A session's id: the base64url SHA-256 of its cookie token. */
export const sessionId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'is not a session id');

/** The one sign-in provider configured (docs/auth-module.md). */
export const signInProvider = z.literal('google');
