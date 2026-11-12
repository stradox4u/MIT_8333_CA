import { Controller, Get } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { ActivityLog } from './activity-log.js';
import { UserManagementPolicy } from './user-management.policy.js';

@Can(UserManagementPolicy, 'manage')
@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly activityLog: ActivityLog) {}

  @Get()
  list() {
    return this.activityLog.list();
  }
}
