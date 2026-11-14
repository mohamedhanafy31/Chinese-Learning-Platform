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
  accountLabel: string;
  adminLabel: string;
  className: string;
  locale: Locale;
  loginLabel: string;
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
  accountLabel,
  adminLabel,
  className,
  locale,
  loginLabel,
}: AccountLinkProps): React.JSX.Element {
  const [account, setAccount] = useState<{ href: string; label: string }>({
    href: `/${locale}/login`,
    label: loginLabel,
  });
  // Hide the login label until the session check settles, so a signed-in
  // visitor never sees "Log in" flash.
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCurrentUser().then((user) => {
      if (!active) return;
      setResolved(true);
      if (user) {
        setAccount({
          href:
            user.role === Role.ADMIN
              ? roleHome(locale, user.role)
              : `/${locale}/account`,
          label: user.role === Role.ADMIN ? adminLabel : accountLabel,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [accountLabel, adminLabel, locale]);

  return (
    <Link
      href={account.href}
      className={`min-w-24 transition-opacity ${resolved ? '' : 'opacity-0'} ${className}`}
    >
      {account.label}
    </Link>
  );
}
