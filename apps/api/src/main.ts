import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { ZodValidationPipe } from './common/validation/zod-validation.pipe';
import type { Environment } from './config/environment';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const config = app.get(ConfigService<Environment, true>);

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  await app.listen(config.get('PORT', { infer: true }), '0.0.0.0');
}

void bootstrap();
