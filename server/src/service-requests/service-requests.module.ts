import { Module } from '@nestjs/common';
import { RequestCategories } from './request-categories.js';
import { RequestCategoriesController } from './request-categories.controller.js';
import { ServiceRequestLifecycle } from './service-request-lifecycle.js';
import { ServiceRequestPolicy } from './service-request.policy.js';
import { ServiceRequestsController } from './service-requests.controller.js';
import { ServiceRequestsRepository } from './service-requests.repository.js';

/**
 * Service Requests: Users reporting faults on campus, Maintenance Officers
 * working on them, and Administrators overseeing them
 * (docs/service-requests.md).
 */
@Module({
  controllers: [RequestCategoriesController, ServiceRequestsController],
  providers: [
    RequestCategories,
    ServiceRequestsRepository,
    ServiceRequestLifecycle,
    ServiceRequestPolicy,
  ],
})
export class ServiceRequestsModule {}
