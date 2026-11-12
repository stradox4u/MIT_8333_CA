import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfig } from './app-config.js';
import { environment } from './environment.js';

/**
 * Loads the environment (and `.env` outside tests), checks it against
 * `environment`, and offers it everywhere as `AppConfig`.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      validationSchema: environment,
      cache: true,
      // Tests set their own environment; a developer's .env must not leak in.
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
