'use client';

import { useTranslations } from 'next-intl';

import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';

/** The lesson page's shape: a title, the 16:9 player, then the lesson text. */
export default function WatchLoading(): React.JSX.Element {
  const t = useTranslations('Loading');
  return (
    <LoadingRegion label={t('label')}>
      <section className="mx-auto max-w-[1100px] px-4 py-10 sm:px-8 lg:py-14">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-6 h-12 w-3/4 max-w-[32rem]" />
        <Skeleton className="mt-8 aspect-video w-full rounded-xl" />
        <Skeleton className="mt-8 h-5 w-full max-w-[34rem]" />
        <Skeleton className="mt-3 h-5 w-5/6 max-w-[30rem]" />
      </section>
    </LoadingRegion>
  );
}
