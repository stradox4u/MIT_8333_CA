import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import { DemoAccounts } from './users/demo-accounts.js';
import { DemoServiceRequests } from './service-requests/demo-service-requests.js';

/**
 * Seeds demo accounts and requests after migrations install their reference data.
 */
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
try {
  const settings = app.get(AppConfig).demoAccounts;
  await app.get(DemoAccounts).seed(settings);
  await app.get(DemoServiceRequests).seed(settings.domain);
  console.log('Demo accounts and Service Requests are ready.');
} finally {
  await app.close();
}
