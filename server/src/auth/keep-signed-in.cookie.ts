import type { Response } from 'express';
import { cookiesAreSecure } from '../config.js';
import {
  KEEP_SIGNED_IN_COOKIE,
  KEEP_SIGNED_IN_COOKIE_MAX_AGE_MS,
} from './session-lifetime.js';

/**
 * Remembers this browser's "keep me signed in" choice until it signs in,
 * where `session.metadata` reads it back (see `asksToKeepSignedIn`).
 */
export function rememberKeepSignedIn(
  response: Response,
  keepSignedIn: boolean,
) {
  const options = {
    httpOnly: true,
    secure: cookiesAreSecure(),
    sameSite: 'lax' as const,
    path: '/api/auth',
  };
  if (keepSignedIn) {
    response.cookie(KEEP_SIGNED_IN_COOKIE, '1', {
      ...options,
      maxAge: KEEP_SIGNED_IN_COOKIE_MAX_AGE_MS,
    });
  } else {
    response.clearCookie(KEEP_SIGNED_IN_COOKIE, options);
  }
}
