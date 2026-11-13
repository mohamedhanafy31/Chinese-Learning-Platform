import 'server-only';

import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { Role, type Locale, type PublicUser } from '@app/shared';

import { safeNext } from '@/lib/safe-next';
import { getCurrentUser } from '@/lib/session';

export async function requireUser(
  locale: Locale,
  fallback: string,
  requiredRole?: (typeof Role)[keyof typeof Role] | true,
): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) {
    const currentPath = (await headers()).get('x-current-path');
    const next = safeNext(currentPath, fallback);
    redirect(`/${locale}/session/renew?${new URLSearchParams({ next })}`);
  }
  const role = requiredRole === true ? Role.ADMIN : requiredRole;
  if (role && user.role !== role) notFound();
  return user;
}
