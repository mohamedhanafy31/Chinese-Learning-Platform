import { isAllowedOrigin } from './origin';

describe('isAllowedOrigin', () => {
  const applicationUrl = 'https://learn.example.com/some-path';

  it('allows non-mutating requests without an Origin header', () => {
    expect(isAllowedOrigin('GET', undefined, applicationUrl)).toBe(true);
  });

  it('requires the exact application origin for mutating requests', () => {
    expect(
      isAllowedOrigin('POST', 'https://learn.example.com', applicationUrl),
    ).toBe(true);
    expect(
      isAllowedOrigin('POST', 'https://attacker.example.com', applicationUrl),
    ).toBe(false);
    expect(isAllowedOrigin('DELETE', undefined, applicationUrl)).toBe(false);
  });

  it('rejects malformed origins', () => {
    expect(isAllowedOrigin('PATCH', 'not a URL', applicationUrl)).toBe(false);
  });
});
