import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        genReqId(request, response) {
          const incoming = request.headers['x-request-id'];
          const requestId =
            typeof incoming === 'string' && incoming.length > 0
              ? incoming
              : randomUUID();
          response.setHeader('x-request-id', requestId);
          return requestId;
        },
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
