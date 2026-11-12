import { Global, Injectable, Module } from '@nestjs/common';

/**
 * The current time in epoch milliseconds. Everything time-based (session
 * lifetimes, link expiry, the daily cleanup) reads it from here, so tests can
 * move time by replacing this provider.
 */
@Injectable()
export class Clock {
  now(): number {
    return Date.now();
  }
}

@Global()
@Module({ providers: [Clock], exports: [Clock] })
export class ClockModule {}
