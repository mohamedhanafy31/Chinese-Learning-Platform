'use client';

import { useTranslations } from 'next-intl';

import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';

/** An admin page's shape: a heading, a lede, then a ruled list. */
export default function BackofficeLoading(): React.JSX.Element {
  const t = useTranslations('Loading');
  return (
    <LoadingRegion label={t('label')}>
      <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
        <Skeleton className="h-14 w-2/3 max-w-[24rem]" />
        <Skeleton className="mt-4 h-6 w-full max-w-[34rem]" />
        <div className="mt-10 border-t-2 border-wash">
          {[0, 1, 2, 3].map((row) => (
            <div key={row} className="border-b border-wash py-5">
              <Skeleton className="h-7 w-1/2 max-w-[18rem]" />
              <Skeleton className="mt-3 h-4 w-2/3 max-w-[24rem]" />
            </div>
          ))}
        </div>
      </section>
    </LoadingRegion>
  );
}
