import { describe, expect, it } from '@jest/globals';

import {
  TUS_SIGNATURE_TTL_SEC,
  embedToken,
  embedUrl,
  failureReasonFor,
  mapVideoStatus,
  mapWebhookStatus,
  tusExpiry,
  tusSignature,
} from './bunny-signing';

const VIDEO_ID = '11111111-2222-3333-4444-555555555555';

describe('tusSignature', () => {
  it('matches the pinned sha256(libraryId + apiKey + expire + videoId) vector', () => {
    expect(
      tusSignature({
        libraryId: '12345',
        apiKey: 'api-key-secret',
        expire: 1_700_000_000,
        videoId: VIDEO_ID,
      }),
    ).toBe('3ecb93c513db6cbfd2625e4af9e4987b2f8a1d937e19177526539dacaf07e185');
  });

  it('expires six hours after now, in unix seconds', () => {
    expect(TUS_SIGNATURE_TTL_SEC).toBe(21_600);
    expect(tusExpiry(1_700_000_000_999)).toBe(1_700_000_000 + 21_600);
  });
});

describe('embed token and url', () => {
  it('matches the pinned sha256(tokenKey + videoId + expires) vector', () => {
    expect(
      embedToken({
        tokenKey: 'token-key-secret',
        videoId: VIDEO_ID,
        expires: 1_700_007_200,
      }),
    ).toBe('8e8979ca88f819b8797c7ba93017af5d5c7c305004f028530e5deeebe9076055');
  });

  it('builds the embed url with the documented query', () => {
    expect(
      embedUrl({
        base: 'https://iframe.mediadelivery.net/',
        libraryId: '12345',
        videoId: VIDEO_ID,
        tokenKey: 'token-key-secret',
        expires: 1_700_007_200,
      }),
    ).toBe(
      `https://iframe.mediadelivery.net/embed/12345/${VIDEO_ID}` +
        '?token=8e8979ca88f819b8797c7ba93017af5d5c7c305004f028530e5deeebe9076055' +
        '&expires=1700007200&autoplay=false&preload=true&responsive=true',
    );
  });
});

describe('mapWebhookStatus', () => {
  it.each([
    [0, 'PROCESSING'],
    [1, 'PROCESSING'],
    [2, 'PROCESSING'],
    [3, 'READY'],
    [4, 'READY'],
    [5, 'FAILED'],
    [6, 'PROCESSING'],
    [7, 'PROCESSING'],
    [8, 'FAILED'],
    [9, null],
    [10, null],
    [32, null],
    [-1, null],
  ])('maps webhook %d to %s', (status, expected) => {
    expect(mapWebhookStatus(status)).toBe(expected);
  });
});

describe('mapVideoStatus', () => {
  it.each([
    [0, null],
    [1, 'PROCESSING'],
    [2, 'PROCESSING'],
    [3, 'PROCESSING'],
    [4, 'READY'],
    [5, 'FAILED'],
    [6, 'FAILED'],
    [7, 'PROCESSING'],
    [8, 'PROCESSING'],
    [99, null],
  ])('maps video status %d to %s', (status, expected) => {
    expect(mapVideoStatus(status)).toBe(expected);
  });

  it('names the failure without secrets', () => {
    expect(failureReasonFor(5)).toBe('encoding-failed');
    expect(failureReasonFor(6)).toBe('upload-failed');
  });
});
