'use client';

import { usePathname } from 'next/navigation';

/** A short glaze-settle arrival after locale-prefixed client navigation. */
export function PageTransition({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const pathname = usePathname();

  return (
    <div key={pathname} data-page-transition="">
      {children}
    </div>
  );
}
