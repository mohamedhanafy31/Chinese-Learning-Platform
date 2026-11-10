import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../../config/environment';

/** Every Bunny setting, present only when all five required values are set. */
export interface BunnySettings {
  libraryId: string;
  apiKey: string;
  tokenKey: string;
  webhookSecret: string;
  cdnHost: string;
  apiBase: string;
  embedBase: string;
  embedTtlSec: number;
}

/**
 * The one place that reads BUNNY_* values. Secrets stay on the server: only
 * the per-upload TUS signature and per-view embed token ever leave it.
 */
@Injectable()
export class BunnyConfig {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  /** null unless Bunny is fully configured. */
  get settings(): BunnySettings | null {
    const get = <K extends keyof Environment>(key: K): Environment[K] =>
      this.config.get(key, { infer: true });
    const libraryId = get('BUNNY_LIBRARY_ID');
    const apiKey = get('BUNNY_API_KEY');
    const tokenKey = get('BUNNY_TOKEN_KEY');
    const webhookSecret = get('BUNNY_WEBHOOK_SECRET');
    const cdnHost = get('BUNNY_CDN_HOST');
    if (!libraryId || !apiKey || !tokenKey || !webhookSecret || !cdnHost) {
      return null;
    }
    return {
      libraryId,
      apiKey,
      tokenKey,
      webhookSecret,
      cdnHost,
      apiBase: get('BUNNY_API_BASE').replace(/\/+$/, ''),
      embedBase: get('BUNNY_EMBED_BASE').replace(/\/+$/, ''),
      embedTtlSec: get('BUNNY_EMBED_TTL_SEC'),
    };
  }

  require(): BunnySettings {
    const settings = this.settings;
    if (!settings) throw new Error('Bunny Stream is not configured');
    return settings;
  }

  get reconcileIntervalSec(): number {
    return this.config.get('VIDEO_RECONCILE_INTERVAL_SEC', { infer: true });
  }
}
