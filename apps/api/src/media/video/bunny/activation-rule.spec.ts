import { describe, expect, it } from '@jest/globals';

import { decideReady } from './activation-rule';

const at = (iso: string, id: string) => ({ id, createdAt: new Date(iso) });

describe('decideReady', () => {
  it('activates when the lesson has no active video', () => {
    expect(decideReady(at('2026-01-02T00:00:00Z', 'b'), null)).toBe('activate');
  });

  it('activates an asset newer than the active one', () => {
    expect(
      decideReady(
        at('2026-01-02T00:00:00Z', 'b'),
        at('2026-01-01T00:00:00Z', 'a'),
      ),
    ).toBe('activate');
  });

  it('discards a late READY of an older asset', () => {
    expect(
      decideReady(
        at('2026-01-01T00:00:00Z', 'a'),
        at('2026-01-02T00:00:00Z', 'b'),
      ),
    ).toBe('discard');
  });

  it('keeps the asset that is already active', () => {
    const same = at('2026-01-01T00:00:00Z', 'a');
    expect(decideReady(same, same)).toBe('keep');
  });

  it('breaks an exact timestamp tie by id, deterministically', () => {
    const when = '2026-01-01T00:00:00Z';
    expect(decideReady(at(when, 'b'), at(when, 'a'))).toBe('activate');
    expect(decideReady(at(when, 'a'), at(when, 'b'))).toBe('discard');
  });
});
