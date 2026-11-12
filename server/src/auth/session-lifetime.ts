import type { SessionRecord } from '@nestjs/authentication';

/**
 * How long sessions last (docs/auth-module.md, "Sessions"):
 *
 * - With "keep me signed in": ends after 3 days unused, with no overall
 *   limit. The package enforces this through its `idleTtl`, with its
 *   `absoluteTtl` at the maximum.
 * - Without it: ends after 1 hour unused. The package has one idle timeout
 *   for every session, so this shorter one is ours (`hasGoneIdle`).
 */
export const KEPT_SESSION_IDLE_LIMIT = '3d';
export const SESSION_ABSOLUTE_LIMIT = '36500d';
const UNKEPT_SESSION_IDLE_LIMIT_MS = 60 * 60 * 1000;

/**
 * Carries "keep me signed in" from the request that asks for a Sign-in Link
 * (or starts a Google sign-in) to the request that signs in, in the same
 * browser. A link used in another browser finds no cookie there, so it
 * starts an ordinary session.
 */
export const KEEP_SIGNED_IN_COOKIE = 'keep_signed_in';
export const KEEP_SIGNED_IN_COOKIE_MAX_AGE_MS = 15 * 60 * 1000;

export function isKeptSignedIn(session: Pick<SessionRecord, 'metadata'>) {
  return session.metadata?.keepSignedIn === true;
}

/**
 * Whether a session without "keep me signed in" has gone unused for an hour.
 * `lastActiveAt` is the last activity as stored, before this request.
 */
export function hasGoneIdle(
  session: Pick<SessionRecord, 'metadata'>,
  lastActiveAt: Date,
  now: number,
) {
  return (
    !isKeptSignedIn(session) &&
    now - lastActiveAt.getTime() >= UNKEPT_SESSION_IDLE_LIMIT_MS
  );
}

/** Whether a request's `Cookie` header asks to keep the new session signed in. */
export function asksToKeepSignedIn(
  cookieHeader: string | string[] | undefined,
) {
  const header = Array.isArray(cookieHeader)
    ? cookieHeader.join('; ')
    : cookieHeader;
  return (header ?? '')
    .split(';')
    .some((cookie) => cookie.trim() === `${KEEP_SIGNED_IN_COOKIE}=1`);
}
