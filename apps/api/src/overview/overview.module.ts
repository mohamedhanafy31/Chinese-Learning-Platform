import { Module } from '@nestjs/common';

import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';
import { BillingModule } from '../billing/billing.module';
import { VideoModule } from '../media/video/video.module';

@Module({
  imports: [BillingModule, VideoModule],
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
