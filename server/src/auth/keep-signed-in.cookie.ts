import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { AppConfig } from '../config/app-config.js';
import {
  KEEP_SIGNED_IN_COOKIE,
  KEEP_SIGNED_IN_COOKIE_MAX_AGE_MS,
} from './session-lifetime.js';

/**
 * Remembers this browser's "keep me signed in" choice until it signs in,
 * where `session.metadata` reads it back (see `asksToKeepSignedIn`).
 */
@Injectable()
export class KeepSignedInCookie {
  constructor(private readonly config: AppConfig) {}

  remember(response: Response, keepSignedIn: boolean) {
    const options = {
      httpOnly: true,
      secure: this.config.cookiesAreSecure,
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
}
