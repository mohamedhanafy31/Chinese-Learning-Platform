import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { PaymobConfig } from './paymob.config';

const REQUEST_TIMEOUT_MS = 15_000;

export class PaymobError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'PaymobError';
  }
}

const idSchema = z
  .union([z.string().min(1), z.number().int().safe()])
  .transform(String);
const intentionSchema = z
  .object({
    id: idSchema,
    client_secret: z.string().min(1),
    intention_order_id: idSchema,
  })
  .passthrough();

export interface CreateIntentionInput {
  amountMinor: number;
  currency: 'EGP';
  integrationIds: number[];
  items: Array<{
    name: string;
    amount: number;
    description: string;
    quantity: 1;
  }>;
  billingData: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
  };
  specialReference: string;
  notificationUrl: string;
  redirectionUrl: string;
}

export interface CreatedIntention {
  id: string;
  clientSecret: string;
  intentionOrderId: string;
}

@Injectable()
export class PaymobClient {
  constructor(@Inject(PaymobConfig) private readonly config: PaymobConfig) {}

  async createIntention(
    input: CreateIntentionInput,
  ): Promise<CreatedIntention> {
    const settings = this.config.require();
    let response: Response;
    try {
      response = await fetch(`${settings.apiBase}/v1/intention/`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${settings.secretKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: input.amountMinor,
          currency: input.currency,
          payment_methods: input.integrationIds,
          items: input.items,
          billing_data: {
            first_name: input.billingData.firstName,
            last_name: input.billingData.lastName,
            email: input.billingData.email,
            phone_number: input.billingData.phoneNumber,
            apartment: 'NA',
            floor: 'NA',
            street: 'NA',
            building: 'NA',
            shipping_method: 'NA',
            postal_code: 'NA',
            city: 'NA',
            country: 'NA',
            state: 'NA',
          },
          special_reference: input.specialReference,
          notification_url: input.notificationUrl,
          redirection_url: input.redirectionUrl,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new PaymobError(
        timedOut
          ? 'Paymob intention request timed out'
          : 'Paymob intention API could not be reached',
        null,
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new PaymobError(
        `Paymob intention API answered ${response.status}`,
        response.status,
      );
    }
    let json: unknown;
    try {
      json = (await response.json()) as unknown;
    } catch {
      throw new PaymobError('Paymob returned invalid JSON', response.status);
    }
    const parsed = intentionSchema.safeParse(json);
    if (!parsed.success) {
      throw new PaymobError(
        'Paymob returned an unexpected response',
        response.status,
      );
    }
    return {
      id: parsed.data.id,
      clientSecret: parsed.data.client_secret,
      intentionOrderId: parsed.data.intention_order_id,
    };
  }
}
