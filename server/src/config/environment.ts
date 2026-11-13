import { z } from 'zod';
import {
  MAIL_TRANSPORT_KINDS,
  SMTP_STARTTLS_MODES,
} from '../mail/mail-transport.js';

/**
 * Every environment variable the API reads, checked once at startup by
 * `@nestjs/config`: a missing or malformed value stops the app before it
 * serves anything. `server/.env.example` documents each one.
 */
export const environment = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  /** The client app's public URL: emailed links and Google return here. */
  APP_URL: z.url(),
  DATABASE_URL: z.string().min(1),

  MAIL_TRANSPORT: z.enum(MAIL_TRANSPORT_KINDS).default('smtp'),
  SMTP_URL: z.string().min(1),
  /** Explicit opt-in for trusted plaintext relays such as Docker Mailpit. */
  SMTP_STARTTLS: z.enum(SMTP_STARTTLS_MODES).optional(),
  MAIL_FROM: z.string().min(1),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  /** Proxies in front of the API (Netlify, Railway's edge). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  RATE_LIMIT_BY_IP: z.stringbool().default(true),
  /** Only plain-HTTP test runs turn this off. */
  COOKIE_SECURE: z.stringbool().default(true),

  /** Read by the seed only, which checks the password rules itself. */
  DEMO_ACCOUNTS_DOMAIN: z.string().min(1).default('demo.mit8333.example'),
  DEMO_ACCOUNTS_PASSWORD: z.string().optional(),

  OBSERVE_APP_KEY: z.string().trim().default(''),
  OBSERVE_APP_SECRET: z.string().trim().default(''),
});

export type Environment = z.infer<typeof environment>;
