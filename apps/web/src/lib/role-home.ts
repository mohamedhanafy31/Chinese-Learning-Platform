import { Role, type Locale, type PublicUser } from '@app/shared';

export function roleHome(locale: Locale, role: PublicUser['role']): string {
  return role === Role.ADMIN ? `/${locale}/admin` : `/${locale}/dashboard`;
}
