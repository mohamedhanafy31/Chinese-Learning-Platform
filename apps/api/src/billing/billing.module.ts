import { Module } from '@nestjs/common';

import { BillingExpiryService } from './billing-expiry.service';
import { BillingReportService } from './billing-report.service';
import {
  AdminBillingController,
  AdminOrdersController,
  BillingController,
} from './billing.controller';
import { BillingService } from './billing.service';
import { PaymobClient } from './paymob/paymob.client';
import { PaymobConfig } from './paymob/paymob.config';
import { PaymobWebhookController } from './paymob/paymob-webhook.controller';
import { PaymobWebhookService } from './paymob/paymob-webhook.service';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [LearningModule],
  controllers: [
    BillingController,
    AdminOrdersController,
    AdminBillingController,
    PaymobWebhookController,
  ],
  providers: [
    PaymobConfig,
    PaymobClient,
    PaymobWebhookService,
    BillingService,
    BillingExpiryService,
    BillingReportService,
  ],
  exports: [BillingExpiryService, BillingService, BillingReportService],
})
export class BillingModule {}
