import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { AuthorizationService, Can } from '@nestjs/authorization';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import type { z } from 'zod';
import type { User } from '../users/user.js';
import { refuseIf, refuseUnlessVisible } from './refusals.js';
import { ServiceRequestLifecycle } from './service-request-lifecycle.js';
import {
  serviceRequestDetailsResponse,
  serviceRequestPageResponse,
  submittedResponse,
} from './service-request.responses.js';
import {
  assignBody,
  completeBody,
  listQuery,
  type ListScopeName,
  referenceParam,
  submitBody,
} from './service-request.schemas.js';
import {
  type ServiceRequestAccess,
  ServiceRequestPolicy,
} from './service-request.policy.js';
import {
  type ListScope,
  ServiceRequestsRepository,
} from './service-requests.repository.js';

const HIDDEN =
  'No such Service Request, or one the User may not see: the same answer';

/** Answers the request as it stands after the change, as the actor sees it. */
const ANSWERS_THE_REQUEST = {
  description: 'The Service Request after the change',
  standardSchema: serviceRequestDetailsResponse,
};

@Can(ServiceRequestPolicy, 'use')
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(
    private readonly serviceRequests: ServiceRequestsRepository,
    private readonly lifecycle: ServiceRequestLifecycle,
    private readonly authorization: AuthorizationService,
  ) {}

  /** Submits a Service Request, raised by the signed-in User. */
  @Post()
  @ApiCreatedResponse({
    description: 'Submitted, with its Reference',
    standardSchema: submittedResponse,
  })
  @ApiBadRequestResponse({
    description:
      'A field is invalid, or `categoryId` names no Request Category',
  })
  async submit(
    @CurrentUser() requester: User,
    @Body({ schema: submitBody }) body: z.infer<typeof submitBody>,
  ) {
    const submitted = await this.lifecycle.submit({
      ...body,
      // Last, so nothing in the body can raise it in another User's name.
      requesterId: requester.id,
    });
    refuseIf(submitted);
    return { reference: submitted.reference };
  }

  /**
   * A page of Service Requests: those the User raised (`requested`), those
   * a Maintenance Officer has held an Assignment for (`assigned`), or, for
   * Administrators, all of them (`all`).
   */
  @Get()
  @ApiOkResponse({ standardSchema: serviceRequestPageResponse })
  async list(
    @CurrentUser() user: User,
    @Query({ schema: listQuery }) query: z.infer<typeof listQuery>,
  ) {
    const { scope, ...filters } = query;
    const listed = await this.serviceRequests.list(
      await this.scopeFor(user, scope),
      filters,
    );
    const items = await Promise.all(
      listed.items.map(async (item) =>
        withPriorityIfVisible(
          await this.priorityVisible(user, {
            currentOfficerId: item.assignment?.officer.id ?? null,
          }),
          item,
        ),
      ),
    );
    return { ...listed, items };
  }

  /** The tracking page: the details, and the timeline oldest first. */
  @Get(':reference')
  @ApiOkResponse({ standardSchema: serviceRequestDetailsResponse })
  @ApiNotFoundResponse({ description: HIDDEN })
  find(
    @CurrentUser() user: User,
    @Param('reference', { schema: referenceParam }) reference: string,
  ) {
    return this.show(user, reference);
  }

  /**
   * Assigns Open work to an active officer so they can start it; assigning
   * its current officer changes nothing.
   */
  @Put(':reference/assignment')
  @Can(ServiceRequestPolicy, 'manage')
  @ApiOkResponse(ANSWERS_THE_REQUEST)
  @ApiBadRequestResponse({
    description: '`officerId` isn’t an active Maintenance Officer',
  })
  @ApiNotFoundResponse({ description: 'No such Service Request' })
  @ApiConflictResponse({ description: 'It’s Completed, Verified or Cancelled' })
  async assign(
    @CurrentUser() admin: User,
    @Param('reference', { schema: referenceParam }) reference: string,
    @Body({ schema: assignBody }) body: z.infer<typeof assignBody>,
  ) {
    refuseIf(
      await this.lifecycle.assign(reference, body.officerId, admin.id),
      'assigned',
    );
    return this.show(admin, reference);
  }

  /** Ends the current Assignment, handing the request back to Submitted. */
  @Delete(':reference/assignment')
  @Can(ServiceRequestPolicy, 'manage')
  @HttpCode(200)
  @ApiOkResponse(ANSWERS_THE_REQUEST)
  @ApiNotFoundResponse({ description: 'No such Service Request' })
  @ApiConflictResponse({ description: 'It isn’t Assigned or In Progress' })
  async unassign(
    @CurrentUser() admin: User,
    @Param('reference', { schema: referenceParam }) reference: string,
  ) {
    refuseIf(await this.lifecycle.unassign(reference, admin.id), 'unassigned');
    return this.show(admin, reference);
  }

  /** The current officer starts the work: Assigned to In Progress. */
  @Post(':reference/start')
  @HttpCode(200)
  @ApiOkResponse(ANSWERS_THE_REQUEST)
  @ApiForbiddenResponse({ description: 'Only its current officer may' })
  @ApiNotFoundResponse({ description: HIDDEN })
  @ApiConflictResponse({ description: 'It isn’t Assigned' })
  async start(
    @CurrentUser() officer: User,
    @Param('reference', { schema: referenceParam }) reference: string,
  ) {
    await this.authorizeWork(officer, reference);
    refuseIf(await this.lifecycle.start(reference, officer.id), 'started');
    return this.show(officer, reference);
  }

  /**
   * The current officer finishes the work: In Progress to Completed, with
   * an optional note kept on that Status Update.
   */
  @Post(':reference/complete')
  @HttpCode(200)
  @ApiOkResponse(ANSWERS_THE_REQUEST)
  @ApiForbiddenResponse({ description: 'Only its current officer may' })
  @ApiNotFoundResponse({ description: HIDDEN })
  @ApiConflictResponse({ description: 'It isn’t In Progress' })
  async complete(
    @CurrentUser() officer: User,
    @Param('reference', { schema: referenceParam }) reference: string,
    @Body({ schema: completeBody }) body: z.infer<typeof completeBody>,
  ) {
    await this.authorizeWork(officer, reference);
    refuseIf(
      await this.lifecycle.complete(reference, officer.id, body?.note ?? null),
      'completed',
    );
    return this.show(officer, reference);
  }

  /** 404 unless `user` may see the request; then 403 unless they're its current officer. */
  private async authorizeWork(user: User, reference: string) {
    const access = await this.findVisible(user, reference);
    await this.authorization.authorize(
      ServiceRequestPolicy,
      'work',
      user,
      access,
    );
  }

  /**
   * A request as `user` sees it: 404 unless they may see it, and without
   * its Priority unless they may see that too.
   */
  private async show(user: User, reference: string) {
    await this.findVisible(user, reference);
    const request = await this.serviceRequests.findDetails(reference);
    refuseIf(request);
    return withPriorityIfVisible(
      await this.priorityVisible(user, {
        currentOfficerId: request.assignment?.officer.id ?? null,
      }),
      request,
    );
  }

  /** Who is connected to the request, after checking `user` may see it. */
  private async findVisible(user: User, reference: string) {
    const access = await this.serviceRequests.findAccess(reference);
    refuseIf(access);
    refuseUnlessVisible(
      await this.authorization.can(ServiceRequestPolicy, 'view', user, access),
    );
    return access;
  }

  private priorityVisible(
    user: User,
    request: Pick<ServiceRequestAccess, 'currentOfficerId'>,
  ) {
    return this.authorization.can(
      ServiceRequestPolicy,
      'seePriority',
      user,
      request,
    );
  }

  /** A list's scope, once `user` may list it. */
  private async scopeFor(user: User, scope: ListScopeName): Promise<ListScope> {
    switch (scope) {
      case 'requested':
        return { requestedBy: user.id };
      case 'assigned':
        await this.authorization.authorize(
          ServiceRequestPolicy,
          'listAssigned',
          user,
        );
        return { assignedTo: user.id };
      case 'all':
        await this.authorization.authorize(
          ServiceRequestPolicy,
          'manage',
          user,
        );
        return { all: true };
    }
  }
}

/**
 * The request as answered: without its `priority` key at all, not `null`,
 * for Users the policy doesn't let see the Priority.
 */
function withPriorityIfVisible<Request extends { priority: unknown }>(
  priorityVisible: boolean,
  request: Request,
): Request | Omit<Request, 'priority'> {
  if (priorityVisible) {
    return request;
  }
  const { priority: _hidden, ...withoutPriority } = request;
  return withoutPriority;
}
