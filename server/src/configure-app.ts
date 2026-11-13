import { type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import { AppConfig } from './config/app-config.js';
import { createValidationPipe } from './validation.js';

/** App-wide HTTP settings, shared by `main.ts` and the tests. */
export function configureApp(app: INestApplication) {
  const config = app.get(AppConfig);
  // Netlify forwards `/api/*` here (ADR-0005), so every route lives under it.
  app.setGlobalPrefix('api');
  // Read the client's IP from `X-Forwarded-For`, past our own proxies only.
  const express = app.getHttpAdapter().getInstance() as Express;
  express.set('trust proxy', config.trustedProxyHops);
  // Refuse state-changing requests from other sites' pages (ADR-0001).
  app.enableCsrfProtection({ trustedOrigins: config.trustedOrigins });
  // Validates every `@Body({ schema })`, `@Param(…, { schema })`, … (Zod).
  app.useGlobalPipes(createValidationPipe());
  serveApiDocs(app, config);
}

/**
 * Swagger UI at `/api/docs` and the OpenAPI document at `/api/docs-json`,
 * public, built from the routes and their Zod schemas.
 */
function serveApiDocs(app: INestApplication, config: AppConfig) {
  const sessionCookie = config.sessionCookieName;
  const document = new DocumentBuilder()
    .setTitle('MIT 8333 Maintenance API')
    .setDescription(
      'Service requests for university maintenance. Sign in through ' +
        '`/api/auth/sign-in-link` or `/api/auth/sign-in`; the session cookie ' +
        'then authenticates every other request. Validation errors retain ' +
        '`statusCode`, `error` and the legacy `message` array, and add ' +
        '`issues: [{ path: ["firstName"], message: "..." }]`. Paths are ' +
        'relative to the validated input; an empty path is a form-level error.',
    )
    .setVersion('1.0')
    .addCookieAuth(
      sessionCookie,
      { type: 'apiKey', in: 'cookie', name: sessionCookie },
      'session',
    )
    .addSecurityRequirements('session')
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    () => SwaggerModule.createDocument(app, document),
    { useGlobalPrefix: true },
  );
}
