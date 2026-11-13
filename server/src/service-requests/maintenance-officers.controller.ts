import { Controller, Get } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { MaintenanceOfficers } from './maintenance-officers.js';
import { maintenanceOfficerResponse } from './service-request.responses.js';
import { ServiceRequestPolicy } from './service-request.policy.js';

@Can(ServiceRequestPolicy, 'manage')
@Controller('maintenance-officers')
export class MaintenanceOfficersController {
  constructor(private readonly officers: MaintenanceOfficers) {}

  /** Active officers with their counts of Open Assignments, for assigning. */
  @Get()
  @ApiOkResponse({ standardSchema: z.array(maintenanceOfficerResponse) })
  list() {
    return this.officers.list();
  }
}
