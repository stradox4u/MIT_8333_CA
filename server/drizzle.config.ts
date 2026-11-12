import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs outside Nest, so it can't use the app's config module.
// It reads DATABASE_URL from the environment, or from .env when present.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
