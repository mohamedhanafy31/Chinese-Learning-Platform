import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Req,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';

import { BunnyConfig } from './bunny.config';
import { BunnyVideoService, type ApplyOutcome } from './bunny-video.service';
import {
  BUNNY_SIGNATURE_ALGORITHM_HEADER,
  BUNNY_SIGNATURE_HEADER,
  BUNNY_SIGNATURE_VERSION_HEADER,
  supportedSignatureScheme,
  verifyBunnySignature,
} from './bunny-webhook.verifier';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipOriginCheck } from '../../../common/decorators/skip-origin-check.decorator';

/**
 * Bunny calls this from its own servers, so it has no cookie session and no
 * browser Origin: authenticity comes only from the HMAC signature. Delivery
 * bursts at encode time, hence a bucket of its own.
 */
const WEBHOOK_THROTTLE = { default: { limit: 600, ttl: 60_000 } };

const payloadSchema = z.object({
  VideoLibraryId: z.union([z.number(), z.string()]),
  VideoGuid: z.string().min(1),
  Status: z.number().int(),
});

@Controller('webhooks')
@Public()
@SkipOriginCheck()
export class BunnyWebhookController {
  private readonly logger = new Logger(BunnyWebhookController.name);

  constructor(
    @Inject(BunnyConfig) private readonly config: BunnyConfig,
    @Inject(BunnyVideoService) private readonly videos: BunnyVideoService,
  ) {}

  @Post('bunny')
  @HttpCode(HttpStatus.OK)
  @Throttle(WEBHOOK_THROTTLE)
  async receive(
    @Req() request: RawBodyRequest<Request>,
  ): Promise<{ status: ApplyOutcome }> {
    const settings = this.config.settings;
    if (!settings) throw new NotFoundException();

    const rawBody = request.rawBody;
    const header = request.get(BUNNY_SIGNATURE_HEADER);
    const scheme = supportedSignatureScheme(
      request.get(BUNNY_SIGNATURE_VERSION_HEADER),
      request.get(BUNNY_SIGNATURE_ALGORITHM_HEADER),
    );
    if (
      !scheme ||
      !verifyBunnySignature(rawBody, header, settings.webhookSecret)
    ) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let parsed: z.ZodSafeParseResult<z.infer<typeof payloadSchema>>;
    try {
      parsed = payloadSchema.safeParse(
        JSON.parse((rawBody as Buffer).toString('utf8')),
      );
    } catch {
      parsed = payloadSchema.safeParse(undefined);
    }
    if (!parsed.success) {
      // Signed but not the event shape we handle: acknowledge so it is not
      // retried forever, and leave a trace.
      this.logger.warn('Ignored a signed Bunny webhook with an unknown shape');
      return { status: 'ignored' };
    }

    const status = await this.videos.handleWebhook({
      rawBody: rawBody as Buffer,
      libraryId: String(parsed.data.VideoLibraryId),
      guid: parsed.data.VideoGuid,
      status: parsed.data.Status,
    });
    return { status };
  }
}
