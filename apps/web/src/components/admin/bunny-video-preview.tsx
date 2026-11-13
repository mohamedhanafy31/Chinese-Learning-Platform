'use client';

import { Film } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { AdminVideo } from '@app/shared';

import { secondaryButton } from '@/components/admin/controls';
import { FormAlert } from '@/components/auth/form-controls';
import { BunnyPlayer } from '@/components/video/lesson-player';
import { LoadingRegion, Skeleton } from '@/components/ui/skeleton';
import { useAdminBunnyPreview } from '@/lib/use-admin-bunny-preview';

export function BunnyVideoPreview({
  lessonId,
  video,
}: {
  lessonId: string;
  video: AdminVideo;
}): React.JSX.Element {
  const t = useTranslations('Admin.video.bunny');
  const { retry, state } = useAdminBunnyPreview(lessonId, video);

  if (state.kind === 'loading') {
    return (
      <LoadingRegion label={t('previewLoading')}>
        <Skeleton className="aspect-video w-full rounded-xl" />
      </LoadingRegion>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="grid aspect-video place-items-center p-5 text-center">
        <div className="grid justify-items-center gap-3">
          <FormAlert>{t('previewError')}</FormAlert>
          <button type="button" onClick={retry} className={secondaryButton}>
            {t('previewRetry')}
          </button>
        </div>
      </div>
    );
  }
  if (state.kind === 'other') {
    return (
      <p
        data-testid="video-bunny-note"
        className="flex items-center gap-3 rounded-2xl bg-glaze-shade px-5 py-8 text-cobalt"
      >
        <Film aria-hidden="true" className="size-6 shrink-0" />
        {t('previewNote')}
      </p>
    );
  }
  return (
    <BunnyPlayer
      label={t('previewTitle')}
      lessonId={lessonId}
      embedUrl={state.embedUrl}
      expiresAt={state.expiresAt}
      reveal={false}
      testId="video-bunny-preview"
    />
  );
}
