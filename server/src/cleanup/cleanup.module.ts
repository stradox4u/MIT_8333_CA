import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RateLimitingModule } from '../rate-limiting/rate-limiting.module.js';
import { UsersModule } from '../users/users.module.js';
import { DailyCleanup } from './daily-cleanup.js';

@Module({
  imports: [ScheduleModule.forRoot(), UsersModule, RateLimitingModule],
  providers: [DailyCleanup],
})
export class CleanupModule {}
