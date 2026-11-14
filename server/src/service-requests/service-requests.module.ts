import { ServiceRequestWritesRepository } from './service-request-writes.repository.js';
import { UsersModule } from '../users/users.module.js';
import { PhotosModule } from '../photos/photos.module.js';
import { Global, Module } from '@nestjs/common';
import { OfficerDepartures } from '../users/officer-departures.js';
import { MaintenanceOfficersRepository } from './maintenance-officers.repository.js';
import { MaintenanceOfficersController } from './maintenance-officers.controller.js';
import { RequestCategoriesRepository } from './request-categories.repository.js';
import { RequestCategoriesController } from './request-categories.controller.js';
import { ServiceRequestLifecycle } from './service-request-lifecycle.js';
import { ServiceRequestNotifications } from './service-request-notifications.js';
import { ServiceRequestPolicy } from './service-request.policy.js';
import { ServiceRequestsController } from './service-requests.controller.js';
import { ServiceRequestsRepository } from './service-requests.repository.js';
import { DemoServiceRequests } from './demo-service-requests.js';

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
  imports: [UsersModule, PhotosModule],
  controllers: [
    RequestCategoriesController,
    ServiceRequestsController,
    MaintenanceOfficersController,
  ],
  providers: [
    ServiceRequestWritesRepository,
    RequestCategoriesRepository,
    ServiceRequestsRepository,
    ServiceRequestLifecycle,
    ServiceRequestNotifications,
    MaintenanceOfficersRepository,
    ServiceRequestPolicy,
    DemoServiceRequests,
    { provide: OfficerDepartures, useExisting: ServiceRequestLifecycle },
  ],
  exports: [OfficerDepartures, ServiceRequestLifecycle],
})
export class ServiceRequestsModule {}
