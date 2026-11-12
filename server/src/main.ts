import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './config/app-config.js';
import { configureApp } from './configure-app.js';
import { ObserveInstrument } from './observe.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  configureApp(app);
  await app.listen(app.get(AppConfig).port);
}
await bootstrap();
