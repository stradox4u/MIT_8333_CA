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
export const keepSignedInQuery = z.enum(['true', 'false', '']).optional();

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
