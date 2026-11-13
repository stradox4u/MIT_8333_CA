import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RateLimitCountersModule } from '../rate-limiting/rate-limit-counters.js';
import { UsersModule } from '../users/users.module.js';
import { DailyCleanup } from './daily-cleanup.js';
import { ServiceRequestsModule } from '../service-requests/service-requests.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    UsersModule,
    RateLimitCountersModule,
    ServiceRequestsModule,
  ],
  providers: [DailyCleanup],
})
export class CleanupModule {}
