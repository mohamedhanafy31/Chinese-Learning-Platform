import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Bunny Stream webhook signing (docs, checked 2026-11-10): lowercase hex
 * HMAC-SHA256 of the raw body in `X-BunnyStream-Signature`, keyed with the
 * library's Read-Only API key, alongside `X-BunnyStream-Signature-Version: v1`
 * and `X-BunnyStream-Signature-Algorithm: hmac-sha256`. This module is the
 * only place that knows the format.
 */
export const BUNNY_SIGNATURE_HEADER = 'x-bunnystream-signature';
export const BUNNY_SIGNATURE_VERSION_HEADER = 'x-bunnystream-signature-version';
export const BUNNY_SIGNATURE_ALGORITHM_HEADER =
  'x-bunnystream-signature-algorithm';

/**
 * A signature scheme we don't implement must not be accepted. Absent headers
 * are tolerated (the digest itself is still required and checked).
 */
export function supportedSignatureScheme(
  version: string | undefined,
  algorithm: string | undefined,
): boolean {
  if (version !== undefined && version.trim().toLowerCase() !== 'v1') {
    return false;
  }
  return (
    algorithm === undefined || algorithm.trim().toLowerCase() === 'hmac-sha256'
  );
}

const HEX_SHA256 = /^[0-9a-f]{64}$/i;
/** Accepted, optional prefixes: `sha256=<hex>` and `v1,<hex>`. */
const PREFIX = /^(?:sha256=|v1,)/i;

/** The lowercase hex HMAC-SHA256 of the raw body bytes. */
export function signBunnyBody(rawBody: Buffer, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Verifies the signature over the exact bytes that arrived (never a
 * re-serialised JSON body). The digest is hex; `sha256=` or `v1,` in front of
 * it is tolerated. A missing, malformed or mismatching header is `false`; the
 * comparison is constant-time and length-checked first.
 */
export function verifyBunnySignature(
  rawBody: Buffer | undefined,
  header: string | undefined,
  secret: string,
): boolean {
  if (!rawBody || !header || !secret) return false;
  const candidate = header.trim().replace(PREFIX, '').trim();
  if (!HEX_SHA256.test(candidate)) return false;
  const expected = Buffer.from(signBunnyBody(rawBody, secret), 'hex');
  const received = Buffer.from(candidate, 'hex');
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}
