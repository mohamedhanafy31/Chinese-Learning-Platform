import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { createHttpLoggerOptions } from './common/logging/http-logger';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
import { AuthGuard } from './common/guards/auth.guard';
import { OriginGuard } from './common/guards/origin.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AssessmentModule } from './assessment/assessment.module';
import { AuditModule } from './audit/audit.module';
import { BillingModule } from './billing/billing.module';
import { CatalogModule } from './catalog/catalog.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { LearningModule } from './learning/learning.module';
import { MediaModule } from './media/media.module';
import { VideoModule } from './media/video/video.module';
import { OverviewModule } from './overview/overview.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: createHttpLoggerOptions(),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuditModule,
    IdentityModule,
    MediaModule,
    CatalogModule,
    LearningModule,
    AssessmentModule,
    BillingModule,
    VideoModule,
    OverviewModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OriginGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
