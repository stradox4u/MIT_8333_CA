import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { UsersModule } from '../users/users.module.js';
import { DailyCleanup } from './daily-cleanup.js';

@Module({
  imports: [ScheduleModule.forRoot(), UsersModule],
  providers: [DailyCleanup],
})
export class CleanupModule {}
