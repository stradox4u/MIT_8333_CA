import { Controller, Get } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { RequestCategoriesRepository } from './request-categories.repository.js';
import { requestCategoryResponse } from './service-request.responses.js';
import { ServiceRequestPolicy } from './service-request.policy.js';

@Can(ServiceRequestPolicy, 'use')
@Controller('request-categories')
export class RequestCategoriesController {
  constructor(private readonly categories: RequestCategoriesRepository) {}

  /** The six Request Categories, for the request form and its filters. */
  @Get()
  @ApiOkResponse({ standardSchema: z.array(requestCategoryResponse) })
  list() {
    return this.categories.list();
  }
}
