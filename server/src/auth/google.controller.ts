import {
  Controller,
  Get,
  Param,
  Query,
  Redirect,
  Res,
  UseFilters,
} from '@nestjs/common';
import { OidcService, Public } from '@nestjs/authentication';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { keepSignedInQuery, signInProvider } from './auth.schemas.js';
import { KeepSignedInCookie } from './keep-signed-in.cookie.js';
import { GoogleCallbackFilter } from './google-callback.filter.js';
import { ApiErrors } from '../api-docs.js';

const loginQuery = z.object({
  keepSignedIn: keepSignedInQuery,
  /** A relative path to land on afterwards; the package ignores anything else. */
  redirectTo: z.string().max(2048).optional(),
});

/** Google's answer: `code` and `state`, or `error`. The package checks them. */
const callbackQuery = z.record(z.string(), z.string().max(4096));

/** "Continue with Google": the redirect to Google, and the way back. */
@Public()
@Controller('auth/oidc')
export class GoogleController {
  constructor(
    private readonly oidc: OidcService,
    private readonly keepSignedIn: KeepSignedInCookie,
  ) {}

  @Get(':provider/login')
  @ApiErrors(400)
  @Redirect()
  @ApiOperation({ security: [] })
  @ApiResponse({
    status: 302,
    description: 'Redirect to Google to authenticate.',
    headers: {
      Location: {
        description: 'Google authorization URL.',
        schema: { type: 'string' },
      },
    },
  })
  async login(
    @Param('provider', { schema: signInProvider }) provider: string,
    @Query({ schema: loginQuery }) query: z.infer<typeof loginQuery>,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.keepSignedIn.remember(response, query.keepSignedIn);
    const { url } = await this.oidc.start(provider, {
      redirectTo: query.redirectTo,
    });
    return { url, statusCode: 302 };
  }

  @Get(':provider/callback')
  @Redirect()
  @UseFilters(GoogleCallbackFilter)
  @ApiOperation({ security: [] })
  @ApiQuery({
    name: 'code',
    required: false,
    schema: { type: 'string', maxLength: 4096 },
    description: 'Authorization code supplied by Google on success.',
  })
  @ApiQuery({
    name: 'state',
    required: false,
    schema: { type: 'string', maxLength: 4096 },
    description: 'Sign-in state supplied by Google and checked by the server.',
  })
  @ApiQuery({
    name: 'error',
    required: false,
    schema: { type: 'string', maxLength: 4096 },
    description: 'Provider error, such as denied consent.',
  })
  @ApiResponse({
    status: 302,
    description:
      'On success, redirectTo or /. On failure, APP_URL/sign-in?error=' +
      'account_deactivated (a proved deactivated User), otherwise google_sign_in_failed.',
    headers: {
      Location: {
        description: 'Safe application success or failure destination.',
        schema: { type: 'string' },
      },
    },
  })
  async callback(
    @Param('provider', { schema: signInProvider }) provider: string,
    @Query({ schema: callbackQuery }) query: z.infer<typeof callbackQuery>,
  ) {
    const { url } = await this.oidc.finish(provider, query);
    return { url, statusCode: 302 };
  }
}
