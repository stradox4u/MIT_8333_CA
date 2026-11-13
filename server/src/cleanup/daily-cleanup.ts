import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '@nestjs/authentication';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Clock } from '../clock.js';
import { RateLimitCounters } from '../rate-limiting/rate-limit-counters.js';
import { UsersRepository } from '../users/users.repository.js';
import { ServiceRequestLifecycle } from '../service-requests/service-request-lifecycle.js';

const PENDING_SIGN_UP_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** Deletes abandoned sign-ups and expired counters, then verifies work unanswered for seven days. */
@Injectable()
export class DailyCleanup {
  private readonly logger = new Logger(DailyCleanup.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly counters: RateLimitCounters,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
    private readonly serviceRequests: ServiceRequestLifecycle,
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

    await this.counters.deleteExpired();
    const verified = await this.serviceRequests.verifyOverdue();

    this.logger.log(`Deleted ${abandoned.length} abandoned Pending Sign-ups`);
    this.logger.log(
      `Automatically verified ${verified} Completed Service Requests`,
    );
  }
}
