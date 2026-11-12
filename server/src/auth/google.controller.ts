import { Controller, Get, Param, Query, Redirect, Res } from '@nestjs/common';
import { OidcService, Public } from '@nestjs/authentication';
import type { Response } from 'express';
import { rememberKeepSignedIn } from './keep-signed-in.cookie.js';

/** "Continue with Google": the redirect to Google, and the way back. */
@Public()
@Controller('auth/oidc')
export class GoogleController {
  constructor(private readonly oidc: OidcService) {}

  @Get(':provider/login')
  @Redirect()
  async login(
    @Param('provider') provider: string,
    @Query('keepSignedIn') keepSignedIn: string | undefined,
    @Query('redirectTo') redirectTo: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    rememberKeepSignedIn(response, keepSignedIn === 'true');
    const { url } = await this.oidc.start(provider, { redirectTo });
    return { url, statusCode: 302 };
  }

  @Get(':provider/callback')
  @Redirect()
  async callback(
    @Param('provider') provider: string,
    @Query() query: Record<string, unknown>,
  ) {
    const { url } = await this.oidc.finish(provider, query);
    return { url, statusCode: 302 };
  }
}
