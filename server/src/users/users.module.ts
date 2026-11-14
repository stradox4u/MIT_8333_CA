import { Module } from '@nestjs/common';
import { ActivityLogRepository } from './activity-log.repository.js';
import { ActivityLogController } from './activity-log.controller.js';
import { DemoAccounts } from './demo-accounts.js';
import { Invitations } from './invitations.js';
import { UserErasure } from './user-erasure.js';
import { UserManagementPolicy } from './user-management.policy.js';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';

/**
 * Users: the people with accounts, their Roles and their personal details,
 * and Administrators managing them. Authentication (`AuthModule`) signs
 * them in; this module owns the records.
 */
@Module({
  controllers: [UsersController, ActivityLogController],
  providers: [
    UsersRepository,
    Invitations,
    UserManagementPolicy,
    UserErasure,
    ActivityLogRepository,
    DemoAccounts,
  ],
  exports: [UsersRepository, UserErasure, ActivityLogRepository],
})
export class UsersModule {}
