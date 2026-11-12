import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppConfig } from '../config/app-config.js';
import { AccountDeactivatedException } from './account-deactivated.exception.js';

/** Only Google's callback is a navigation whose failures belong on a client page. */
@Catch()
export class GoogleCallbackFilter implements ExceptionFilter {
  private readonly logger = new Logger(GoogleCallbackFilter.name);

  constructor(private readonly config: AppConfig) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (!(exception instanceof HttpException) || exception.getStatus() >= 500) {
      // Keep failures visible without logging provider payloads, codes or tokens.
      this.logger.error('Google callback failed unexpectedly');
    }
    const destination = new URL('/sign-in', this.config.appUrl);
    destination.searchParams.set(
      'error',
      exception instanceof AccountDeactivatedException
        ? 'account_deactivated'
        : 'google_sign_in_failed',
    );
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');
    response.redirect(302, destination.href);
  }
}
