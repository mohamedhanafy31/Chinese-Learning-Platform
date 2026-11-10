import type { Locale } from '@app/shared';

const localePath = /^\/(?:ar|en|zh)\//;
const scheme = /^[a-z][a-z\d+.-]*:/i;

export function safeNext(
  value: string | null | undefined,
  fallback: string,
): string {
  if (!value || !localePath.test(value) || value.startsWith('//'))
    return fallback;
  if (value.includes('\\') || scheme.test(value)) return fallback;

  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }

  if (
    decoded.includes('\\') ||
    decoded.includes('//') ||
    scheme.test(decoded)
  ) {
    return fallback;
  }

  const pathname = decoded.split(/[?#]/, 1)[0] ?? '';
  if (
    pathname.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    return fallback;
  }

  return value;
}

export function localeFallback(locale: Locale): string {
  return `/${locale}/dashboard`;
}
