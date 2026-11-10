import 'reflect-metadata';

import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { Role } from '@app/shared';

import { AppModule } from '../src/app.module';
import { Roles } from '../src/common/decorators/roles.decorator';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe';
import { IdentityClockService } from '../src/identity/identity-clock.service';
import { MAIL_SERVICE } from '../src/identity/identity.constants';
import { IdentityService } from '../src/identity/identity.service';
import { InMemoryMailService } from '../src/identity/mail.service';
import { BunnyVideoService } from '../src/media/video/bunny/bunny-video.service';
import { BillingExpiryService } from '../src/billing/billing-expiry.service';
import { serveUploadedImages } from '../src/media/serve-media';
import { enableDevVideoUploadCors } from '../src/media/video/dev-cors';

@Controller('test/roles')
class TestRolesController {
  @Get('admin')
  @Roles(Role.ADMIN)
  adminOnly(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [AppModule],
  controllers: [TestRolesController],
})
class TestAppModule {}

interface TestMessage {
  now?: string;
  requestId: string;
  type:
    | 'clock:reset'
    | 'clock:set'
    | 'identity:deactivate'
    | 'mail:clear'
    | 'mail:get'
    | 'billing:expire'
    | 'video:reconcile';
  userId?: string;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(TestAppModule, {
    rawBody: true,
  });
  app.set('trust proxy', 1);
  app.use(cookieParser());
  serveUploadedImages(app);
  enableDevVideoUploadCors(app, process.env.APP_URL ?? '');
  app.useGlobalPipes(new ZodValidationPipe());
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');

  const mail = app.get(MAIL_SERVICE);
  if (!(mail instanceof InMemoryMailService)) {
    throw new Error(
      'The integration test server requires the in-memory mailer',
    );
  }
  const clock = app.get(IdentityClockService);
  const identity = app.get(IdentityService);
  const bunnyVideos = app.get(BunnyVideoService);
  const billingExpiry = app.get(BillingExpiryService);
  const systemNow = IdentityClockService.prototype.now.bind(clock);

  process.on('message', (message: TestMessage) => {
    void (async () => {
      switch (message.type) {
        case 'mail:get':
          process.send?.({
            type: 'mail:outbox',
            requestId: message.requestId,
            outbox: mail.outbox,
          });
          break;
        case 'mail:clear':
          mail.clear();
          process.send?.({ type: 'ok', requestId: message.requestId });
          break;
        case 'clock:set':
          if (!message.now) {
            throw new Error('clock:set requires now');
          }
          clock.now = () => new Date(message.now as string);
          process.send?.({ type: 'ok', requestId: message.requestId });
          break;
        case 'clock:reset':
          clock.now = systemNow;
          process.send?.({ type: 'ok', requestId: message.requestId });
          break;
        case 'video:reconcile':
          process.send?.({
            type: 'video:reconciled',
            requestId: message.requestId,
            result: await bunnyVideos.reconcileOnce(),
          });
          break;
        case 'billing:expire':
          process.send?.({
            type: 'billing:expired',
            requestId: message.requestId,
            result: await billingExpiry.expireOnce(
              message.now ? new Date(message.now) : new Date(),
            ),
          });
          break;
        case 'identity:deactivate':
          if (!message.userId) {
            throw new Error('identity:deactivate requires userId');
          }
          await identity.deactivateUser(message.userId);
          process.send?.({ type: 'ok', requestId: message.requestId });
          break;
      }
    })().catch((error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      process.send?.({
        type: 'error',
        requestId: message.requestId,
        error: errorMessage,
      });
    });
  });

  const address = app.getHttpServer().address() as { port: number };
  process.send?.({ type: 'ready', port: address.port });

  process.once('SIGTERM', () => {
    void app.close().finally(() => process.exit(0));
  });
}

void bootstrap();
