import { describe, expect, it } from 'vitest';

import { embedRefreshAction, embedRefreshDelay } from './embed-refresh';

describe('Bunny embed refresh scheduling', () => {
  const expiresAt = 1_000_000;

  it('schedules before the one-minute refresh window', () => {
    expect(embedRefreshAction(expiresAt - 60_001, expiresAt, false)).toBe(
      'schedule',
    );
    expect(embedRefreshDelay(expiresAt - 60_001, expiresAt)).toBe(1);
  });

  it('refreshes before expiry when paused and waits to swap while playing', () => {
    expect(embedRefreshAction(expiresAt - 60_000, expiresAt, false)).toBe(
      'refresh-now',
    );
    expect(embedRefreshAction(expiresAt - 60_000, expiresAt, true)).toBe(
      'refresh-and-wait',
    );
  });

  it('refreshes immediately when the signed URL is already expired', () => {
    expect(embedRefreshAction(expiresAt + 1, expiresAt, false)).toBe(
      'refresh-now',
    );
    expect(embedRefreshAction(expiresAt + 1, expiresAt, true)).toBe(
      'refresh-and-wait',
    );
  });
});
