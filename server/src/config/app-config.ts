import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MailSettings } from '../mail/mail-transport.js';
import type { Environment } from './environment.js';

/**
 * The app's configuration, typed and named for what it's used for. Every
 * setting is read here, through `@nestjs/config`. Only two places read
 * `process.env` directly, because they run before or outside the app's
 * config: `AppConfigModule` (whether to load `.env`, before `ConfigService`
 * exists) and `drizzle.config.ts` (drizzle-kit runs outside Nest). Whether
 * Observe runs is decided from the environment `@nestjs/config` loaded, by
 * `ConditionalModule` (see `observeIsConfigured`).
 */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  get port() {
    return this.read('PORT');
  }

  /** The client app's public URL, where emailed links point. */
  get appUrl() {
    return this.read('APP_URL');
  }

  /**
   * Origins whose pages may send state-changing requests: the client app's.
   * Netlify rewrites `Host` to the API's own (ADR-0005), so the app's origin
   * never matches it and has to be listed.
   */
  get trustedOrigins() {
    return [new URL(this.appUrl).origin];
  }

  get databaseUrl() {
    return this.read('DATABASE_URL');
  }

  get mail(): MailSettings {
    return {
      transport: this.read('MAIL_TRANSPORT'),
      smtpUrl: this.read('SMTP_URL'),
      from: this.read('MAIL_FROM'),
    };
  }

  /** The OAuth client registered for "Continue with Google". */
  get google() {
    return {
      clientId: this.read('GOOGLE_CLIENT_ID'),
      clientSecret: this.read('GOOGLE_CLIENT_SECRET'),
    };
  }

  /**
   * How many proxies sit in front of the API and append to
   * `X-Forwarded-For`, so `request.ip` is the client's.
   */
  get trustedProxyHops() {
    return this.read('TRUST_PROXY_HOPS');
  }

  /**
   * Whether the client's IP reaches the API, so per-IP limits mean
   * something (docs/auth-module.md, "Abuse protection").
   */
  get rateLimitByIp() {
    return this.read('RATE_LIMIT_BY_IP');
  }

  /** Whether cookies carry `Secure`; browsers accept them on localhost. */
  get cookiesAreSecure() {
    return this.read('COOKIE_SECURE');
  }

  /** The session cookie's name, as the auth package picks it (ADR-0001). */
  get sessionCookieName() {
    return this.cookiesAreSecure ? '__Host-sid' : 'sid';
  }

  get demoAccounts() {
    return {
      domain: this.read('DEMO_ACCOUNTS_DOMAIN'),
      password: this.read('DEMO_ACCOUNTS_PASSWORD'),
    };
  }

  get observe() {
    return {
      appKey: this.read('OBSERVE_APP_KEY'),
      appSecret: this.read('OBSERVE_APP_SECRET'),
    };
  }

  private read<K extends keyof Environment>(key: K): Environment[K] {
    return this.config.get(key, { infer: true });
  }
}
