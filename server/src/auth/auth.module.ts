import { Module } from '@nestjs/common';
import {
  AuthenticationModule,
  AuthenticationStorage,
  google,
} from '@nestjs/authentication';
import { Clock } from '../clock.js';
import { AppConfig } from '../config/app-config.js';
import { DATABASE, type Database } from '../database/database.js';
import { AccountController } from './account.controller.js';
import { AccountPolicy } from './account.policy.js';
import { AuthController } from './auth.controller.js';
import { DrizzleAuthStore } from './drizzle-auth.store.js';
import { FreshAuthentication } from './fresh-authentication.js';
import { GoogleAccounts } from './google-accounts.resolver.js';
import { GoogleController } from './google.controller.js';
import { GoogleCallbackFilter } from './google-callback.filter.js';
import { GoogleFetch, GoogleFetchModule } from './google-fetch.js';
import { KeepSignedInCookie } from './keep-signed-in.cookie.js';
import { PasswordAttempts } from './password-attempts.js';
import {
  asksToKeepSignedIn,
  KEPT_SESSION_IDLE_LIMIT,
  SESSION_ABSOLUTE_LIMIT,
} from './session-lifetime.js';
import { PasswordsController } from './passwords.controller.js';
import { SessionAuth } from './session-auth.provider.js';
import { SessionsController } from './sessions.controller.js';
import { SignInLinks } from './sign-in-links.handler.js';
import { RateLimitCountersModule } from '../rate-limiting/rate-limit-counters.js';
import { UsersModule } from '../users/users.module.js';
import './authentication-types.js';

@Module({
  imports: [
    UsersModule,
    RateLimitCountersModule,
    AuthenticationModule.forRootAsync({
      imports: [GoogleFetchModule],
      inject: [Clock, GoogleFetch, AppConfig],
      useFactory: (
        clock: Clock,
        googleFetch: GoogleFetch,
        config: AppConfig,
      ) => {
        const now = () => clock.now();
        return {
          session: {
            cookie: { secure: config.cookiesAreSecure },
            // The client app, whose requests arrive with Netlify's rewritten Host.
            trustedOrigins: config.trustedOrigins,
            idleTtl: KEPT_SESSION_IDLE_LIMIT,
            absoluteTtl: SESSION_ABSOLUTE_LIMIT,
            // The browser, and "keep me signed in". No IP address
            // (docs/auth-module.md).
            metadata: (request) => ({
              userAgent: request.headers['user-agent'],
              keepSignedIn: asksToKeepSignedIn(request.headers.cookie),
            }),
            now,
          },
          magicLink: {
            url: new URL('/sign-in/link', config.appUrl).href,
            // Links work on any device (ADR-0006).
            bindToBrowser: false,
            now,
          },
          oidc: {
            // Google returns to the client's origin; Netlify forwards it here.
            callbackUrl: `${config.appUrl}/api/auth/oidc/:provider/callback`,
            providers: { google: google(config.google) },
            cookie: { secure: config.cookiesAreSecure },
            fetch: (input, init) => googleFetch.fetch(input, init),
            now,
          },
        };
      },
    }),
  ],
  controllers: [
    AuthController,
    SessionsController,
    PasswordsController,
    AccountController,
    GoogleController,
  ],
  providers: [
    AccountPolicy,
    FreshAuthentication,
    KeepSignedInCookie,
    PasswordAttempts,
    SessionAuth,
    SignInLinks,
    GoogleAccounts,
    GoogleCallbackFilter,
    {
      provide: DrizzleAuthStore,
      inject: [DATABASE, AuthenticationStorage],
      useFactory: (db: Database, storage: AuthenticationStorage) => {
        const store = new DrizzleAuthStore(db);
        storage.registerSource({
          sessions: store,
          magicLinks: store,
          oidcStates: store,
        });
        return store;
      },
    },
  ],
})
export class AuthModule {}
