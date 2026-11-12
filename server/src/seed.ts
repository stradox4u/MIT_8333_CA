import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DemoAccounts } from './users/demo-accounts.js';

/**
 * `npm run db:seed`: the demo accounts. The Roles themselves come with the
 * migrations, so run `npm run db:migrate` first.
 */
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  await app.get(DemoAccounts).seed();
  console.log('Demo accounts are ready.');
} finally {
  await app.close();
}
