import { Controller, Get } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { ApiOkResponse } from '@nestjs/swagger';
import { ActivityLogRepository } from './activity-log.repository.js';
import { UserManagementPolicy } from './user-management.policy.js';
import { activityLogResponse } from './user.responses.js';
import { ApiErrors } from '../api-docs.js';

@Can(UserManagementPolicy, 'manage')
@ApiErrors(401, 403)
@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly activityLog: ActivityLogRepository) {}

  @Get()
  @ApiOkResponse({
    description: 'Activity Log entries, newest first.',
    standardSchema: activityLogResponse,
  })
  list() {
    return this.activityLog.list();
  }
}
