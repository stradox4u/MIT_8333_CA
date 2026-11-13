import { Controller, Get } from '@nestjs/common';
import { Can } from '@nestjs/authorization';
import { RequestCategories } from './request-categories.js';
import { ServiceRequestPolicy } from './service-request.policy.js';

@Can(ServiceRequestPolicy, 'use')
@Controller('request-categories')
export class RequestCategoriesController {
  constructor(private readonly categories: RequestCategories) {}

  /** The six Request Categories, for the request form and its filters. */
  @Get()
  list() {
    return this.categories.list();
  }
}
