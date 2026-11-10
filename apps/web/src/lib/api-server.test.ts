import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: vi.fn() }));

const { clientAddress } = await import('./api-server');

describe('clientAddress', () => {
  it('takes the hop Caddy appended, not client-supplied entries', () => {
    expect(clientAddress('6.6.6.6, 203.0.113.7')).toBe('203.0.113.7');
    expect(clientAddress('2001:db8::1')).toBe('2001:db8::1');
  });

  it('ignores missing or malformed values', () => {
    expect(clientAddress(null)).toBeNull();
    expect(clientAddress('')).toBeNull();
    expect(clientAddress('1.1.1.1, evil header')).toBeNull();
  });
});
