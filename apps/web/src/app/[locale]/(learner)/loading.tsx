'use client';

import { useTranslations } from 'next-intl';

import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';

/** The dashboard's shape: a heading, then a ruled list of level rows. */
export default function LearnerLoading(): React.JSX.Element {
  const t = useTranslations('Loading');
  return (
    <LoadingRegion label={t('label')}>
      <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
        <Skeleton className="h-14 w-3/4 max-w-[28rem]" />
        <Skeleton className="mt-5 h-6 w-full max-w-[34rem]" />
        <div className="mt-10 border-t-2 border-wash">
          {[0, 1, 2].map((row) => (
            <div key={row} className="border-b border-wash py-6">
              <Skeleton className="h-9 w-2/3 max-w-[24rem]" />
              <Skeleton className="mt-4 h-4 w-full max-w-[34rem]" />
              <Skeleton className="mt-3 h-2.5 w-full max-w-[20rem] rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </LoadingRegion>
  );
}
