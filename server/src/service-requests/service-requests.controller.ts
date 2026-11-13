import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import type { z } from 'zod';
import type { User } from '../users/user.js';
import { refuseIf } from './refusals.js';
import { submitBody } from './service-request.schemas.js';
import { ServiceRequestPolicy } from './service-request.policy.js';
import { ServiceRequestsRepository } from './service-requests.repository.js';

@Can(ServiceRequestPolicy, 'use')
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(private readonly serviceRequests: ServiceRequestsRepository) {}

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
}
