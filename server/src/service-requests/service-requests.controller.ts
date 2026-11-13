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
import type { User } from '../users/user.js';
import { refuseIf } from './refusals.js';
import {
  serviceRequestDetailsResponse,
  serviceRequestPageResponse,
  submittedResponse,
} from './service-request.responses.js';
import { listQuery, reference, submitBody } from './service-request.schemas.js';
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
      requesterId: requester.id,
      ...body,
    });
    refuseIf(submitted);
    return { reference: submitted.reference };
  }

  /** A page of Service Requests: so far, those the User raised (`requested`). */
  @Get()
  @ApiOkResponse({ standardSchema: serviceRequestPageResponse })
  list(
    @CurrentUser() user: User,
    @Query({ schema: listQuery }) query: z.infer<typeof listQuery>,
  ) {
    const { scope: _requested, ...filters } = query;
    return this.serviceRequests.listRequestedBy(user.id, filters);
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
    @Param('reference', { schema: reference }) ref: string,
  ) {
    const request =
      (await this.serviceRequests.findByReference(ref)) ?? 'not_found';
    refuseIf(request);
    const visible = await this.authorization.can(
      ServiceRequestPolicy,
      'view',
      user,
      request,
    );
    // Hidden from this User: the same answer as for a Reference nobody has.
    refuseIf(visible || 'not_found');
    return request;
  }
}
