import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '@nestjs/authentication';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, isNull, lte, or } from 'drizzle-orm';
import { Clock } from '../clock.js';
import { InjectDatabase, type Database } from '../database/database.js';
import { rateLimits } from '../database/schema.js';
import { UsersRepository } from '../users/users.repository.js';

const PENDING_SIGN_UP_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Housekeeping, once a day:
 *
 * - Deletes Pending Sign-ups left unfinished for 7 days, with their
 *   sessions. The one hard delete (ADR-0002): nothing references them yet,
 *   and it keeps unused addresses out of the database.
 * - Deletes rate-limit counters whose window and block are over.
 *
 * Expired sessions and links are pruned by their stores as new ones arrive.
 */
@Injectable()
export class DailyCleanup {
  private readonly logger = new Logger(DailyCleanup.name);

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly users: UsersRepository,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    const now = new Date(this.clock.now());

    const abandoned = await this.users.deletePendingSignUpsCreatedBefore(
      new Date(now.getTime() - PENDING_SIGN_UP_LIFETIME_MS),
    );
    for (const id of abandoned) {
      await this.sessions.revokeAll(id);
    }

    await this.db
      .delete(rateLimits)
      .where(
        and(
          lte(rateLimits.windowEndsAt, now),
          or(
            isNull(rateLimits.blockedUntil),
            lte(rateLimits.blockedUntil, now),
          ),
        ),
      );

    this.logger.log(`Deleted ${abandoned.length} abandoned Pending Sign-ups`);
  }
}
