import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { PaymobConfig } from './paymob.config';
import { verifyHmac } from './paymob-hmac';
import {
  PaymobWebhookService,
  type PaymobWebhookOutcome,
} from './paymob-webhook.service';
import { Public } from '../../common/decorators/public.decorator';
import { SkipOriginCheck } from '../../common/decorators/skip-origin-check.decorator';

const WEBHOOK_THROTTLE = { default: { limit: 600, ttl: 60_000 } };

@Controller('webhooks')
@Public()
@SkipOriginCheck()
export class PaymobWebhookController {
  constructor(
    @Inject(PaymobConfig) private readonly config: PaymobConfig,
    @Inject(PaymobWebhookService)
    private readonly webhooks: PaymobWebhookService,
  ) {}

  @Post('paymob')
  @HttpCode(HttpStatus.OK)
  @Throttle(WEBHOOK_THROTTLE)
  async receive(
    @Body() body: unknown,
    @Query('hmac') receivedHmac?: string,
  ): Promise<{ status: PaymobWebhookOutcome }> {
    const settings = this.config.settings;
    if (!settings) throw new NotFoundException();
    if (!isRecord(body) || body.type !== 'TRANSACTION') {
      return { status: 'ignored' };
    }
    if (!verifyHmac(body.obj, receivedHmac, settings.hmacSecret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return { status: await this.webhooks.handle(body.obj) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
