import { Module } from '@nestjs/common';
import { AuthorizationModule } from '@nestjs/authorization';
import { DrizzleModule } from '@nestjs/drizzle';
import { MailModule } from '@nestjs/mail';
import { createObserveModule } from '@nestjs/observe';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AuthModule } from './auth/auth.module.js';
import { CleanupModule } from './cleanup/cleanup.module.js';
import { ClockModule } from './clock.js';
import * as schema from './database/schema.js';
import { createMailTransport } from './mail/mail-transport.js';
import { RateLimitingModule } from './rate-limiting/rate-limiting.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      runtimeMetrics: !Boolean(process.versions?.['webcontainer']),
      serviceId: 'nest-typescript-starter',
    }),
    ClockModule,
    DrizzleModule.forRootAsync({
      useFactory: () => ({
        drizzle,
        connection: { connectionString: process.env.DATABASE_URL },
        schema,
        casing: 'snake_case' as const,
      }),
    }),
    MailModule.forRoot({
      transport: createMailTransport(),
      from: process.env.MAIL_FROM,
      isGlobal: true,
    }),
    RateLimitingModule,
    CleanupModule,
    AuthModule,
    // After authentication, so `request.user` is set. Deny by default (ADR-0003).
    AuthorizationModule.forRoot(),
  ],
})
export class AppModule {}
