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
import { ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { keepSignedInQuery, signInProvider } from './auth.schemas.js';
import { KeepSignedInCookie } from './keep-signed-in.cookie.js';
import { GoogleCallbackFilter } from './google-callback.filter.js';

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
  @Redirect()
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
  @ApiResponse({
    status: 302,
    description:
      'On success, redirectTo or /. On failure, APP_URL/sign-in?error=' +
      'account_deactivated (a proved deactivated User), otherwise google_sign_in_failed.',
  })
  async callback(
    @Param('provider', { schema: signInProvider }) provider: string,
    @Query({ schema: callbackQuery }) query: z.infer<typeof callbackQuery>,
  ) {
    const { url } = await this.oidc.finish(provider, query);
    return { url, statusCode: 302 };
  }
}
