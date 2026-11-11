import { internalApiUrl } from '@/lib/internal-api-url';

/** Fail the web container at boot, not on the first visitor, when misconfigured. */
export function register(): void {
  internalApiUrl();
}
