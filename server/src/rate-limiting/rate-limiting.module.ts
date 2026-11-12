import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from '../config/app-config.js';
import { normalizeEmail } from '../users/users.repository.js';
import { DrizzleThrottlerStorage } from './drizzle-throttler.storage.js';
import {
  RateLimitCounters,
  RateLimitCountersModule,
} from './rate-limit-counters.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * The throttlers, which apply only on routes that use `ThrottlerGuard` (the
 * auth routes): nothing is throttled globally (docs/auth-module.md).
 *
 * - `perIp`: 10 requests per IP per 15 minutes. Off when the client's real IP
 *   doesn't reach the API (`RATE_LIMIT_BY_IP=false`): every request would then
 *   share one bucket.
 * - `perAccount`: 3 requests per address and IP per 15 minutes, or per
 *   address alone when `perIp` is off.
 */
@Module({
  imports: [
    RateLimitCountersModule,
    ThrottlerModule.forRootAsync({
      imports: [RateLimitCountersModule],
      inject: [RateLimitCounters, AppConfig],
      useFactory: (counters: RateLimitCounters, config: AppConfig) => ({
        storage: new DrizzleThrottlerStorage(counters),
        errorMessage: 'Too many attempts. Try again later.',
        throttlers: [
          {
            name: 'perIp',
            ttl: FIFTEEN_MINUTES,
            limit: 10,
            skipIf: () => !config.rateLimitByIp,
          },
          {
            name: 'perAccount',
            ttl: FIFTEEN_MINUTES,
            limit: 3,
            // Per address and IP; per address alone when the IP can't be
            // trusted, so faked IPs can't multiply one address's requests.
            getTracker: (request) =>
              config.rateLimitByIp
                ? `${emailOf(request)}|${request.ip}`
                : emailOf(request),
          },
        ],
      }),
    }),
  ],
  exports: [RateLimitCountersModule],
})
export class RateLimitingModule {}

/** The address a request is about, as stored. */
export function emailOf(request: Record<string, any>): string {
  const email = request.body?.email;
  return typeof email === 'string' ? normalizeEmail(email) : '';
}
