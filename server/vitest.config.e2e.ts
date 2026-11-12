import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Each file boots an in-process Postgres and the app; under load that can
    // take longer than the 10s default.
    hookTimeout: 30_000,
    env: {
      APP_URL: 'http://localhost:5173',
      // Tests talk plain HTTP, so cookies can't be `Secure`.
      COOKIE_SECURE: 'false',
      // Never connected to: tests swap in an in-process database.
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      MAIL_FROM: 'MIT 8333 Maintenance <no-reply@example.com>',
      SMTP_URL: 'smtp://localhost:1025',
      GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-secret',
      // Tests set the client's IP with X-Forwarded-For.
      TRUST_PROXY_HOPS: '1',
    },
  },
});
