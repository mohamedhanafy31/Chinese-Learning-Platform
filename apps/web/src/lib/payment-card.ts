export interface PaymentCard {
  brand: string | null;
  last4: string | null;
}

/** Reads only the allow-listed source_data kept by the API's redactor. */
export function paymentCard(payload: unknown): PaymentCard {
  if (typeof payload !== 'object' || payload === null) {
    return { brand: null, last4: null };
  }
  const source = (payload as Record<string, unknown>).source_data;
  if (typeof source !== 'object' || source === null) {
    return { brand: null, last4: null };
  }
  const fields = source as Record<string, unknown>;
  const brand = typeof fields.sub_type === 'string' ? fields.sub_type : null;
  const pan = typeof fields.pan === 'string' ? fields.pan : '';
  const digits = pan.replace(/\D/g, '');
  return {
    brand,
    last4: digits.length >= 4 ? digits.slice(-4) : null,
  };
}
