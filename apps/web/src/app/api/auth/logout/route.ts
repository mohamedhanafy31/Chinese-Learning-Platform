import { NextResponse, type NextRequest } from 'next/server';

import { siteUrl } from '@/lib/site-url';

function clearIdentityCookies(response: NextResponse): void {
  const secure = process.env.NODE_ENV === 'production';
  const expired = new Date(0);

  response.cookies.set('access_token', '', {
    expires: expired,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure,
  });
  response.cookies.set('refresh_token', '', {
    expires: expired,
    httpOnly: true,
    path: '/api/v1/auth',
    sameSite: 'lax',
    secure,
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Compare with the configured public origin (the API's rule too): behind
  // the TLS-terminating proxy, request.url is not guaranteed to be public.
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(siteUrl()).origin) {
    return NextResponse.json(
      { message: 'Request origin is not allowed' },
      { status: 403 },
    );
  }

  // Server-side revocation is the browser's direct POST to /api/v1/auth/logout:
  // only there is the path-scoped refresh cookie sent. This route just expires
  // the HttpOnly cookies locally so logout survives an API outage.
  const response = new NextResponse(null, { status: 204 });
  clearIdentityCookies(response);
  return response;
}
