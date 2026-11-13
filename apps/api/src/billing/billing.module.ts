import { Module } from '@nestjs/common';

import { BillingReportService } from './billing-report.service';
import {
  AdminBillingController,
  AdminOrdersController,
  BillingController,
} from './billing.controller';
import { BillingService } from './billing.service';
import { PaymobClient } from './paymob/paymob.client';
import { PaymobConfig } from './paymob/paymob.config';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [LearningModule],
  controllers: [
    BillingController,
    AdminOrdersController,
    AdminBillingController,
  ],
  providers: [
    PaymobConfig,
    PaymobClient,
    BillingService,
    BillingReportService,
  ],
  exports: [BillingService, BillingReportService],
})
export class BillingModule {}
