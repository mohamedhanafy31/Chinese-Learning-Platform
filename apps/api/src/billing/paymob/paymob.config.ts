import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment } from '../../config/environment';

export const PAYMOB_REQUIRED_KEYS = [
  'PAYMOB_SECRET_KEY',
  'PAYMOB_PUBLIC_KEY',
  'PAYMOB_HMAC_SECRET',
  'PAYMOB_INTEGRATION_IDS',
] as const;

export interface PaymobSettings {
  secretKey: string;
  publicKey: string;
  hmacSecret: string;
  integrationIds: number[];
  apiBase: string;
  checkoutBase: string;
}

@Injectable()
export class PaymobConfig implements OnModuleInit {
  private readonly logger = new Logger(PaymobConfig.name);

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<Environment, true>,
  ) {}

  onModuleInit(): void {
    const present = PAYMOB_REQUIRED_KEYS.filter((key) =>
      this.config.get(key, { infer: true }),
    );
    if (present.length > 0 && present.length < PAYMOB_REQUIRED_KEYS.length) {
      const missing = PAYMOB_REQUIRED_KEYS.filter(
        (key) => !this.config.get(key, { infer: true }),
      );
      this.logger.warn(
        `Paymob is partially configured (missing ${missing.join(', ')}); payments remain unavailable.`,
      );
    }
  }

  get settings(): PaymobSettings | null {
    const secretKey = this.config.get('PAYMOB_SECRET_KEY', { infer: true });
    const publicKey = this.config.get('PAYMOB_PUBLIC_KEY', { infer: true });
    const hmacSecret = this.config.get('PAYMOB_HMAC_SECRET', { infer: true });
    const ids = this.config.get('PAYMOB_INTEGRATION_IDS', { infer: true });
    if (!secretKey || !publicKey || !hmacSecret || !ids) return null;
    return {
      secretKey,
      publicKey,
      hmacSecret,
      integrationIds: ids.split(',').map((id) => Number(id.trim())),
      apiBase: this.config
        .get('PAYMOB_API_BASE', { infer: true })
        .replace(/\/+$/, ''),
      checkoutBase: this.config.get('PAYMOB_CHECKOUT_BASE', { infer: true }),
    };
  }

  require(): PaymobSettings {
    const settings = this.settings;
    if (!settings) throw new Error('Paymob is not configured');
    return settings;
  }

  get orderTtlMinutes(): number {
    return this.config.get('ORDER_TTL_MIN', { infer: true });
  }

  get expiryIntervalSeconds(): number {
    return this.config.get('BILLING_EXPIRY_INTERVAL_SEC', { infer: true });
  }

  get appUrl(): string {
    return this.config.get('APP_URL', { infer: true }).replace(/\/+$/, '');
  }

  get apiPublicOrigin(): string {
    return (
      this.config.get('API_PUBLIC_ORIGIN', { infer: true }) ?? this.appUrl
    ).replace(/\/+$/, '');
  }
}
