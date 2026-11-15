import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser, SessionService } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import {
  ApiAcceptedResponse,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { z } from 'zod';
import { ActivityLogRepository } from './activity-log.repository.js';
import { refuseIf } from './refusals.js';
import { Invitations } from './invitations.js';
import type { User } from './user.js';
import { emailAddress, personName, roleId, userId } from './user.schemas.js';
import { UserErasure } from './user-erasure.js';
import { UserManagementPolicy } from './user-management.policy.js';
import { UsersRepository } from './users.repository.js';
import { managedUserResponse, managedUsersResponse } from './user.responses.js';
import { ApiErrors } from '../api-docs.js';

const inviteBody = z.object({
  firstName: personName,
  lastName: personName,
  email: emailAddress,
  role: roleId,
});

const changeRoleBody = z.object({ role: roleId });

const correctEmailBody = z.object({ email: emailAddress });

/** Administrators managing other Users' accounts. */
@Can(UserManagementPolicy, 'manage')
@ApiErrors(401, 403)
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersRepository,
    private readonly invitations: Invitations,
    private readonly sessions: SessionService,
    private readonly erasure: UserErasure,
    private readonly activityLog: ActivityLogRepository,
  ) {}

  @Get()
  @ApiOkResponse({
    description: 'Managed Users, including Invitations and erased accounts.',
    standardSchema: managedUsersResponse,
  })
  list() {
    return this.users.list();
  }

  @Patch(':id/role')
  @ApiErrors(400, 404, 409)
  @ApiOkResponse({
    description: 'The updated managed User.',
    standardSchema: managedUserResponse,
  })
  async changeRole(
    @CurrentUser() actor: User,
    @Param('id', { schema: userId }) id: string,
    @Body({ schema: changeRoleBody }) body: z.infer<typeof changeRoleBody>,
  ) {
    const before = await this.users.findById(id);
    refuseIf(
      await this.users.changeRole(id, body.role, actor.id),
      'given another Role',
    );
    if (before?.roleId !== body.role) {
      await this.activityLog.record({
        actorId: actor.id,
        targetId: id,
        action: 'role_changed',
        details: { from: before?.roleId, to: body.role },
      });
    }
    return this.users.findManaged(id);
  }

  @Post(':id/deactivate')
  @ApiErrors(400, 404, 409)
  @HttpCode(200)
  @ApiOkResponse({
    description: 'The updated managed User.',
    standardSchema: managedUserResponse,
  })
  async deactivate(
    @CurrentUser() actor: User,
    @Param('id', { schema: userId }) id: string,
  ) {
    const outcome = await this.users.deactivate(id, actor.id);
    refuseIf(outcome, 'deactivated');
    if (outcome === 'deactivated') {
      await this.sessions.revokeAll(id);
      await this.activityLog.record({
        actorId: actor.id,
        targetId: id,
        action: 'deactivated',
      });
    }
    return this.users.findManaged(id);
  }

  @Post(':id/reactivate')
  @ApiErrors(400, 404, 409)
  @HttpCode(200)
  @ApiOkResponse({
    description: 'The updated managed User.',
    standardSchema: managedUserResponse,
  })
  async reactivate(
    @CurrentUser() actor: User,
    @Param('id', { schema: userId }) id: string,
  ) {
    const outcome = await this.users.reactivate(id);
    refuseIf(outcome, 'reactivated');
    if (outcome === 'reactivated') {
      await this.activityLog.record({
        actorId: actor.id,
        targetId: id,
        action: 'reactivated',
      });
    }
    return this.users.findManaged(id);
  }

  @Post(':id/erase')
  @ApiErrors(400, 404, 409)
  @HttpCode(200)
  @ApiOkResponse({
    description: 'The updated managed User.',
    standardSchema: managedUserResponse,
  })
  async erase(
    @CurrentUser() actor: User,
    @Param('id', { schema: userId }) id: string,
  ) {
    const outcome = await this.erasure.erase(id, actor.id);
    refuseIf(outcome, 'erased');
    if (outcome === 'erased') {
      await this.activityLog.record({
        actorId: actor.id,
        targetId: id,
        action: 'erased',
      });
    }
    return this.users.findManaged(id);
  }

  /** Sends a pending Invitation again. */
  @Post(':id/invitation')
  @ApiErrors(400, 404, 409)
  @HttpCode(202)
  @ApiAcceptedResponse({
    description: 'Invitation email sent; no response body.',
  })
  async resendInvitation(@Param('id', { schema: userId }) id: string) {
    const invitation = await this.users.findPendingInvitation(id);
    refuseIf(invitation);
    if (invitation === 'not_pending') {
      throw new ConflictException('This Invitation has already been accepted');
    }
    await this.invitations.send(invitation);
  }

  /** Corrects a pending Invitation's address, and sends it there. */
  @Patch(':id/email')
  @ApiErrors(400, 404, 409)
  @ApiOkResponse({
    description: 'The updated managed User.',
    standardSchema: managedUserResponse,
  })
  async correctInvitationEmail(
    @Param('id', { schema: userId }) id: string,
    @Body({ schema: correctEmailBody }) body: z.infer<typeof correctEmailBody>,
  ) {
    const outcome = await this.users.correctInvitationEmail(id, body.email);
    refuseIf(outcome);
    if (outcome === 'not_pending') {
      throw new ConflictException(
        'Only a pending Invitation’s address can be changed',
      );
    }
    if (outcome === 'taken') {
      throw new ConflictException('This address already has an account');
    }
    const invitation = await this.users.findPendingInvitation(id);
    if (typeof invitation !== 'string') {
      await this.invitations.send(invitation);
    }
    return this.users.findManaged(id);
  }

  @Post()
  @ApiCreatedResponse({
    description: 'The invited User.',
    standardSchema: managedUserResponse,
  })
  @ApiErrors(400, 409)
  async invite(
    @CurrentUser() actor: User,
    @Body({ schema: inviteBody }) body: z.infer<typeof inviteBody>,
  ) {
    const invited = await this.users.invite({
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      roleId: body.role,
    });
    if (!invited) {
      throw new ConflictException('This address already has an account');
    }
    await this.invitations.send({
      email: invited.email!,
      firstName: body.firstName,
      roleId: body.role,
    });
    await this.activityLog.record({
      actorId: actor.id,
      targetId: invited.id,
      action: 'invited',
      details: { role: body.role },
    });
    return this.users.findManaged(invited.id);
  }
}
