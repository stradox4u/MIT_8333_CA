import { Module } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import { ThrottlerModule } from '@nestjs/throttler';
import { Clock } from '../clock.js';
import { rateLimitByIp } from '../config.js';
import type { Database } from '../database/database.js';
import { normalizeEmail } from '../users/users.repository.js';
import { DrizzleThrottlerStorage } from './drizzle-throttler.storage.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * The throttlers, which apply only on routes that use `ThrottlerGuard` (the
 * auth routes): nothing is throttled globally (docs/auth-module.md).
 *
 * - `perIp`: 10 requests per IP per 15 minutes. Off when the client's real IP
 *   doesn't reach the API (`RATE_LIMIT_BY_IP=false`): every request would then
 *   share one bucket.
 * - `perAccount`: 3 requests per address and IP per 15 minutes. Routes
 *   override the limit and the tracker (`@Throttle()`).
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [getDrizzleToken(), Clock],
      useFactory: (db: Database, clock: Clock) => ({
        storage: new DrizzleThrottlerStorage(db, clock),
        errorMessage: 'Too many attempts. Try again later.',
        throttlers: [
          {
            name: 'perIp',
            ttl: FIFTEEN_MINUTES,
            limit: 10,
            skipIf: () => !rateLimitByIp(),
          },
          {
            name: 'perAccount',
            ttl: FIFTEEN_MINUTES,
            limit: 3,
            getTracker: (request) => `${emailOf(request)}|${request.ip}`,
          },
        ],
      }),
    }),
  ],
})
export class RateLimitingModule {}

/** The address a request is about, as stored. */
export function emailOf(request: Record<string, any>): string {
  const email = request.body?.email;
  return typeof email === 'string' ? normalizeEmail(email) : '';
}
