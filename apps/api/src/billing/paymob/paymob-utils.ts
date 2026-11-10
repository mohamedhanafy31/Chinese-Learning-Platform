export function splitName(name: string): {
  firstName: string;
  lastName: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? 'NA';
  return {
    firstName,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : firstName,
  };
}

/**
 * One checkout URL builder for either Paymob host. M11 must confirm the chosen
 * host and query parameter names against the merchant's real dashboard.
 */
export function buildCheckoutUrl(
  checkoutBase: string,
  publicKey: string,
  clientSecret: string,
): string {
  const url = new URL(checkoutBase);
  url.searchParams.set('publicKey', publicKey);
  url.searchParams.set('clientSecret', clientSecret);
  return url.toString();
}
