import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';

import { routing } from './i18n/routing';

const handleI18n = createMiddleware(routing);
const protectedPath = /^\/(ar|en|zh)\/(account|dashboard|admin)(?:\/|$)/;

export function proxy(request: NextRequest): NextResponse {
  if (/^\/(ar|en|zh)\/admin\/login\/?$/.test(request.nextUrl.pathname)) {
    return handleI18n(request);
  }

  const match = protectedPath.exec(request.nextUrl.pathname);

  if (!match) return handleI18n(request);

  const locale = match[1] ?? routing.defaultLocale;
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (!request.cookies.has('access_token')) {
    const renew = new URL(`/${locale}/session/renew`, request.url);
    renew.searchParams.set('next', nextPath);
    return NextResponse.redirect(renew);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-current-path', nextPath);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!api|media|_next|_vercel|.*\\..*).*)'],
};
