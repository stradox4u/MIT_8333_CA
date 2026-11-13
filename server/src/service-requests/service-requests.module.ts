import { Module } from '@nestjs/common';
import { RequestCategories } from './request-categories.js';
import { RequestCategoriesController } from './request-categories.controller.js';
import { ServiceRequestPolicy } from './service-request.policy.js';

/**
 * Service Requests: Users reporting faults on campus, and following them
 * until the work is done (docs/service-requests.md).
 */
@Module({
  controllers: [RequestCategoriesController],
  providers: [RequestCategories, ServiceRequestPolicy],
})
export class ServiceRequestsModule {}
