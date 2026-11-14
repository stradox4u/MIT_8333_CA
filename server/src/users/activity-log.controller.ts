import { Controller, Get } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { ActivityLogRepository } from './activity-log.repository.js';
import { UserManagementPolicy } from './user-management.policy.js';

@Can(UserManagementPolicy, 'manage')
@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly activityLog: ActivityLogRepository) {}

  @Get()
  list() {
    return this.activityLog.list();
  }
}
