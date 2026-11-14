import { Body, Controller, Header, Post } from '@nestjs/common';
import { CurrentUser } from '@nestjs/authentication';
import { Can } from '@nestjs/authorization';
import { ApiBadRequestResponse, ApiCreatedResponse } from '@nestjs/swagger';
import type { z } from 'zod';
import type { User } from '../users/user.js';
import { ServiceRequestPolicy } from '../service-requests/service-request.policy.js';
import { Photos } from './photos.js';
import { photoUploadBody, photoUploadResponse } from './photo.schemas.js';

@Can(ServiceRequestPolicy, 'use')
@Controller('photo-uploads')
export class PhotoUploadsController {
  constructor(private readonly photos: Photos) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiCreatedResponse({ standardSchema: photoUploadResponse })
  @ApiBadRequestResponse({
    description: 'JPEG, PNG or WebP only, from 1 byte to 5 MiB',
  })
  create(
    @CurrentUser() user: User,
    @Body({ schema: photoUploadBody }) body: z.infer<typeof photoUploadBody>,
  ) {
    return this.photos.upload(user.id, body);
  }
}
