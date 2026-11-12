import { ForbiddenException } from '@nestjs/common';

/**
 * A Deactivated User who proved who they are (the right password, or
 * Google) is told so; strangers get the usual answers (docs/auth-module.md).
 */
export class AccountDeactivatedException extends ForbiddenException {
  constructor() {
    super({
      statusCode: 403,
      error: 'account_deactivated',
      message: 'This account is deactivated. Contact an administrator.',
    });
  }
}
