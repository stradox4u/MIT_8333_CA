import { existsSync } from 'node:fs';
import { MigrationsRepository } from './migrations.repository.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl?.trim()) {
  throw new Error('DATABASE_URL is required to run migrations');
}

await new MigrationsRepository(databaseUrl).migrate();
console.log('Database migrations are up to date.');
