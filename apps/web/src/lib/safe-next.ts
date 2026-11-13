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

export function isAdminPath(value: string, locale: Locale): boolean {
  return new RegExp(`^/${locale}/admin(?:/|$)`).test(value);
}

export function safePortalNext(
  value: string | null | undefined,
  locale: Locale,
  portal: 'admin' | 'student',
): string {
  const fallback =
    portal === 'admin' ? `/${locale}/admin` : localeFallback(locale);
  const next = safeNext(value, fallback);
  return isAdminPath(next, locale) === (portal === 'admin') ? next : fallback;
}

export function loginPathForNext(
  locale: Locale,
  value: string | null | undefined,
): string {
  const next = safeNext(value, localeFallback(locale));
  const loginPath = isAdminPath(next, locale)
    ? `/${locale}/admin/login`
    : `/${locale}/login`;
  return `${loginPath}?${new URLSearchParams({ next })}`;
}
