import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { AuthorizationService, Can } from '@nestjs/authorization';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import type { z } from 'zod';
import type { Priority } from '../database/schema.js';
import type { User } from '../users/user.js';
import { refuseIf, refuseUnlessVisible } from './refusals.js';
import {
  serviceRequestDetailsResponse,
  serviceRequestPageResponse,
  submittedResponse,
} from './service-request.responses.js';
import {
  listQuery,
  referenceParam,
  submitBody,
} from './service-request.schemas.js';
import { ServiceRequestPolicy } from './service-request.policy.js';
import { ServiceRequestsRepository } from './service-requests.repository.js';

@Can(ServiceRequestPolicy, 'use')
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(
    private readonly serviceRequests: ServiceRequestsRepository,
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
    const submitted = await this.serviceRequests.submit({
      ...body,
      // Last, so nothing in the body can raise it in another User's name.
      requesterId: requester.id,
    });
    refuseIf(submitted);
    return { reference: submitted.reference };
  }

  /** A page of Service Requests: so far, those the User raised (`requested`). */
  @Get()
  @ApiOkResponse({ standardSchema: serviceRequestPageResponse })
  async list(
    @CurrentUser() user: User,
    @Query({ schema: listQuery }) query: z.infer<typeof listQuery>,
  ) {
    // The schema admits only `requested` so far: the User's own.
    const listed = await this.serviceRequests.listRequestedBy(user.id, query);
    const priorityShown = await this.seesPriority(user);
    return {
      ...listed,
      items: listed.items.map((item) => withPriorityIf(priorityShown, item)),
    };
  }

  /** The tracking page: the details, and the timeline oldest first. */
  @Get(':reference')
  @ApiOkResponse({ standardSchema: serviceRequestDetailsResponse })
  @ApiNotFoundResponse({
    description:
      'No such Service Request, or one the User may not see: the same answer',
  })
  async find(
    @CurrentUser() user: User,
    @Param('reference', { schema: referenceParam }) reference: string,
  ) {
    const request = await this.serviceRequests.findByReference(reference);
    refuseIf(request);
    refuseUnlessVisible(
      await this.authorization.can(ServiceRequestPolicy, 'view', user, request),
    );
    return withPriorityIf(await this.seesPriority(user), request);
  }

  private seesPriority(user: User) {
    return this.authorization.can(ServiceRequestPolicy, 'seePriority', user);
  }
}

/**
 * The request as shown: without its `priority` key at all, not `null`, for
 * Users the policy doesn't show the Priority to.
 */
function withPriorityIf<Shown extends { priority?: Priority }>(
  shown: boolean,
  request: Shown,
): Shown | Omit<Shown, 'priority'> {
  if (shown) {
    return request;
  }
  const { priority: _hidden, ...withoutPriority } = request;
  return withoutPriority;
}
