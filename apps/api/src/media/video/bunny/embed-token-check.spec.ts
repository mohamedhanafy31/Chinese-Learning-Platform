import { describe, expect, it, jest } from '@jest/globals';

import { BunnyEmbedTokenCheck } from './embed-token-check';
import { embedToken } from './bunny-signing';

const settings = {
  libraryId: '42',
  embedBase: 'https://embed.example',
  tokenKey: 'secret-token-key',
} as never;
const guid = 'video-guid-123';
const player = `<title>Player</title><video>${guid}</video><playlist>`;
const notFound = '<title> 404 </title><h1>404</h1>';
type Reply = number | { status: number; body: string } | Error;

function setup(
  replies: Reply[] = [
    { status: 200, body: player },
    { status: 200, body: notFound },
  ],
  hasVideo = true,
  clock = { value: 1_800_000_000_000 },
  configured = true,
) {
  const fetcher = jest.fn(async (url: string, init: RequestInit) => {
    if (!url || !init.signal) {
      throw new Error('Probe request must include a URL and timeout signal');
    }
    const reply = replies.shift() ?? { status: 500, body: '' };
    if (reply instanceof Error) throw reply;
    const status = typeof reply === 'number' ? reply : reply.status;
    const body = typeof reply === 'number' ? '' : reply.body;
    return new Response(body, { status });
  });
  const findFirst = jest.fn(async () =>
    hasVideo ? { bunnyVideoId: guid } : null,
  );
  const config = {
    get settings() {
      return configured ? settings : null;
    },
  };
  const service = new BunnyEmbedTokenCheck(
    config as never,
    { videoAsset: { findFirst } } as never,
    fetcher,
    () => clock.value,
  );
  return { service, fetcher, findFirst, clock };
}

describe('BunnyEmbedTokenCheck', () => {
  it('treats a 200 Bunny 404 page without the video GUID as enforced', async () => {
    const { service, fetcher } = setup();
    await expect(service.check()).resolves.toMatchObject({
      status: 'enforced',
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [controlUrl, controlInit] = fetcher.mock.calls[0]!;
    const control = new URL(controlUrl);
    expect(control.searchParams.get('token')).toBe(
      embedToken({
        tokenKey: 'secret-token-key',
        videoId: guid,
        expires: 1_800_000_300,
      }),
    );
    expect(control.searchParams.get('expires')).toBe('1800000300');
    expect(controlInit).toMatchObject({ redirect: 'manual' });

    const [probeUrl] = fetcher.mock.calls[1]!;
    const probe = new URL(probeUrl);
    expect(probe.searchParams.get('token')).toMatch(/^0{64}$/);
    expect(probe.searchParams.get('expires')).toBe('1800000300');
  });

  it('treats a 403 wrong-token response as enforced', async () => {
    const { service } = setup([{ status: 200, body: player }, 403]);
    await expect(service.check()).resolves.toMatchObject({
      status: 'enforced',
    });
  });

  it('treats a full player page for the wrong token as not enforced', async () => {
    const { service } = setup([
      { status: 200, body: player },
      { status: 200, body: player },
    ]);
    await expect(service.check()).resolves.toMatchObject({
      status: 'not-enforced',
    });
  });

  it.each([
    [500, player],
    [200, notFound],
  ] as const)(
    'returns unknown when control is HTTP %s without proof',
    async (status, body) => {
      const { service, fetcher } = setup([{ status, body }]);
      await expect(service.check()).resolves.toMatchObject({
        status: 'unknown',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('returns unknown for an unexpected probe status', async () => {
    const { service } = setup([{ status: 200, body: player }, 500]);
    await expect(service.check()).resolves.toMatchObject({ status: 'unknown' });
  });

  it.each([
    new Error('network down'),
    Object.assign(new Error('timed out'), { name: 'AbortError' }),
  ])('classifies request errors as unknown', async (error) => {
    const { service } = setup([error]);
    await expect(service.check()).resolves.toMatchObject({ status: 'unknown' });
  });

  it('caches results for ten minutes and rechecks after expiry', async () => {
    const { service, fetcher, clock } = setup([
      { status: 200, body: player },
      { status: 200, body: notFound },
      { status: 200, body: player },
      { status: 200, body: notFound },
    ]);
    await service.check();
    await service.check();
    expect(fetcher).toHaveBeenCalledTimes(2);
    clock.value += 600_001;
    await service.check();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('caches unknown for at most one minute', async () => {
    const { service, fetcher, clock } = setup([500]);
    await service.check();
    clock.value += 60_001;
    await service.check();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns no-video without probing when no ready asset exists', async () => {
    const { service, fetcher } = setup([], false);
    await expect(service.check()).resolves.toEqual({
      status: 'no-video',
      checkedAt: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns not-configured without probing', async () => {
    const { service, fetcher } = setup([], true, undefined, false);
    await expect(service.check()).resolves.toEqual({
      status: 'not-configured',
      checkedAt: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
