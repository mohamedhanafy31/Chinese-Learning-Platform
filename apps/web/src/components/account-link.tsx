'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  Role,
  userResponseSchema,
  type Locale,
  type PublicUser,
} from '@app/shared';

import { roleHome } from '@/lib/role-home';

interface AccountLinkProps {
  adminLabel: string;
  className: string;
  locale: Locale;
  loginLabel: string;
  learningLabel: string;
}

let currentUserRequest: Promise<PublicUser | null> | null = null;

function loadCurrentUser(): Promise<PublicUser | null> {
  currentUserRequest ??= fetch('/api/v1/auth/me', {
    credentials: 'same-origin',
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const parsed = userResponseSchema.safeParse(await response.json());
      return parsed.success ? parsed.data.user : null;
    })
    .catch(() => null)
    .finally(() => {
      currentUserRequest = null;
    });
  return currentUserRequest;
}

export function AccountLink({
  adminLabel,
  className,
  locale,
  loginLabel,
  learningLabel,
}: AccountLinkProps): React.JSX.Element {
  const [account, setAccount] = useState<{ href: string; label: string }>({
    href: `/${locale}/login`,
    label: loginLabel,
  });

  useEffect(() => {
    let active = true;
    void loadCurrentUser().then((user) => {
      if (active && user) {
        setAccount({
          href: roleHome(locale, user.role),
          label: user.role === Role.ADMIN ? adminLabel : learningLabel,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [adminLabel, learningLabel, locale]);

  return (
    <Link href={account.href} className={`min-w-24 ${className}`}>
      {account.label}
    </Link>
  );
}
