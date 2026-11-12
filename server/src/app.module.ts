import { Module } from '@nestjs/common';
import { AuthorizationModule } from '@nestjs/authorization';
import { DrizzleModule } from '@nestjs/drizzle';
import { MailModule } from '@nestjs/mail';
import { drizzle } from 'drizzle-orm/node-postgres';
import { AuthModule } from './auth/auth.module.js';
import { CleanupModule } from './cleanup/cleanup.module.js';
import { ClockModule } from './clock.js';
import { AppConfig } from './config/app-config.js';
import { AppConfigModule } from './config/app-config.module.js';
import * as schema from './database/schema.js';
import { createMailTransport } from './mail/mail-transport.js';
import { ObserveModule } from './observe.js';
import { RateLimitingModule } from './rate-limiting/rate-limiting.module.js';

@Module({
  imports: [
    AppConfigModule,
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        ...config.observe,
        runtimeMetrics: !process.versions?.['webcontainer'],
        serviceId: 'nest-typescript-starter',
      }),
    }),
    ClockModule,
    DrizzleModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        drizzle,
        connection: { connectionString: config.databaseUrl },
        schema,
        casing: 'snake_case' as const,
      }),
    }),
    MailModule.forRootAsync({
      isGlobal: true,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        transport: createMailTransport(config.mail),
        from: config.mail.from,
      }),
    }),
    RateLimitingModule,
    CleanupModule,
    AuthModule,
    // After authentication, so `request.user` is set. Deny by default (ADR-0003).
    AuthorizationModule.forRoot(),
  ],
})
export class AppModule {}
