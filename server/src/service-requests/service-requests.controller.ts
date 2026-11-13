import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { AuthorizationService, Can } from '@nestjs/authorization';
import type { z } from 'zod';
import type { User } from '../users/user.js';
import { refuseIf } from './refusals.js';
import { reference, submitBody } from './service-request.schemas.js';
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

  /** The tracking page: the details, and the timeline oldest first. */
  @Get(':reference')
  async find(
    @CurrentUser() user: User,
    @Param('reference', { schema: reference }) ref: string,
  ) {
    const request = await this.serviceRequests.findByReference(ref);
    const shown =
      request &&
      (await this.authorization.can(ServiceRequestPolicy, 'view', user, request))
        ? request
        : 'not_found';
    refuseIf(shown);
    return shown;
  }
}
