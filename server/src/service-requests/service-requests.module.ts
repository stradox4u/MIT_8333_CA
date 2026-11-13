import { Global, Module } from '@nestjs/common';
import { OfficerDepartures } from '../users/officer-departures.js';
import { MaintenanceOfficers } from './maintenance-officers.js';
import { MaintenanceOfficersController } from './maintenance-officers.controller.js';
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
 *
 * Global only to provide the Users module's `OfficerDepartures` contract
 * while keeping source dependencies directed from Service Requests to Users.
 */
@Global()
@Module({
  controllers: [
    RequestCategoriesController,
    ServiceRequestsController,
    MaintenanceOfficersController,
  ],
  providers: [
    RequestCategories,
    ServiceRequestsRepository,
    ServiceRequestLifecycle,
    MaintenanceOfficers,
    ServiceRequestPolicy,
    { provide: OfficerDepartures, useExisting: ServiceRequestLifecycle },
  ],
  exports: [OfficerDepartures],
})
export class ServiceRequestsModule {}
