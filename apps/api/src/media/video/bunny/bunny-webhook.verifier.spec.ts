import { describe, expect, it } from '@jest/globals';

import {
  signBunnyBody,
  supportedSignatureScheme,
  verifyBunnySignature,
} from './bunny-webhook.verifier';

const SECRET = 'whsec';
const BODY = Buffer.from(
  '{"VideoLibraryId":12345,"VideoGuid":"abc","Status":3}',
);
const DIGEST =
  '43ae11b5e67ba8ad32c661f44b132b5f25a5186a330f1e1fabd3c157db4277eb';

describe('verifyBunnySignature', () => {
  it('signs with the pinned HMAC-SHA256 vector', () => {
    expect(signBunnyBody(BODY, SECRET)).toBe(DIGEST);
  });

  it('accepts a valid bare hex signature', () => {
    expect(verifyBunnySignature(BODY, DIGEST, SECRET)).toBe(true);
    expect(verifyBunnySignature(BODY, DIGEST.toUpperCase(), SECRET)).toBe(true);
  });

  it('accepts the sha256= and v1, prefixes', () => {
    expect(verifyBunnySignature(BODY, `sha256=${DIGEST}`, SECRET)).toBe(true);
    expect(verifyBunnySignature(BODY, `v1,${DIGEST}`, SECRET)).toBe(true);
  });

  it('rejects the wrong secret', () => {
    expect(verifyBunnySignature(BODY, DIGEST, 'other')).toBe(false);
  });

  it('rejects a body with one byte changed', () => {
    const tampered = Buffer.from(BODY);
    tampered[tampered.length - 2] = (tampered[tampered.length - 2] ?? 0) ^ 0x01;
    expect(verifyBunnySignature(tampered, DIGEST, SECRET)).toBe(false);
  });

  it('rejects a re-serialised body (spaces change the bytes)', () => {
    const reserialised = Buffer.from(
      JSON.stringify(JSON.parse(BODY.toString()), null, 1),
    );
    expect(verifyBunnySignature(reserialised, DIGEST, SECRET)).toBe(false);
  });

  it('rejects a missing or empty header, body or secret', () => {
    expect(verifyBunnySignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifyBunnySignature(BODY, '', SECRET)).toBe(false);
    expect(verifyBunnySignature(undefined, DIGEST, SECRET)).toBe(false);
    expect(verifyBunnySignature(BODY, DIGEST, '')).toBe(false);
  });

  it('rejects wrong lengths and non-hex input without throwing', () => {
    expect(verifyBunnySignature(BODY, DIGEST.slice(0, 62), SECRET)).toBe(false);
    expect(verifyBunnySignature(BODY, `${DIGEST}00`, SECRET)).toBe(false);
    expect(verifyBunnySignature(BODY, 'z'.repeat(64), SECRET)).toBe(false);
    expect(verifyBunnySignature(BODY, 'sha256=', SECRET)).toBe(false);
  });
});

describe('supportedSignatureScheme', () => {
  it('accepts v1 / hmac-sha256 and absent headers', () => {
    expect(supportedSignatureScheme('v1', 'hmac-sha256')).toBe(true);
    expect(supportedSignatureScheme(' V1 ', 'HMAC-SHA256')).toBe(true);
    expect(supportedSignatureScheme(undefined, undefined)).toBe(true);
  });

  it('rejects other versions or algorithms', () => {
    expect(supportedSignatureScheme('v2', 'hmac-sha256')).toBe(false);
    expect(supportedSignatureScheme('v1', 'hmac-sha1')).toBe(false);
  });
});
