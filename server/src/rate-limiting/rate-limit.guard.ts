import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';

/**
 * The throttler guard, plus the standard `Retry-After` header on a 429. The
 * throttler only sends one suffixed per named throttler
 * (`Retry-After-perAccount`), which clients and proxies don't look for.
 */
@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    if (this.commonOptions.setHeaders ?? true) {
      const { res } = this.getRequestResponse(context);
      this.setResponseHeader(res, 'Retry-After', detail.timeToBlockExpire);
    }
    return super.throwThrottlingException(context, detail);
  }
}
