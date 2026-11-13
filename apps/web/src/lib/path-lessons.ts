import { getTranslations } from 'next-intl/server';

import type { ImageRef, LessonAccess, Locale } from '@app/shared';

import type { PathLesson } from '@/components/learning/lesson-path';
import { samplePathLessons } from '@/content/sample-path';
import { pathStateFor } from '@/lib/lesson-access';
import { numberFormat } from '@/lib/numbers';
import { pick } from '@/lib/localized';

/** Lessons for the landing page's clearly labelled sample path. */
export async function toSamplePathLessons(
  locale: Locale,
): Promise<PathLesson[]> {
  const t = await getTranslations({ locale, namespace: 'Path' });
  const nf = numberFormat(locale);

  return samplePathLessons.map((lesson, index) => ({
    id: lesson.id,
    number: t('lessonNumber', { n: nf.format(index + 1) }),
    title: pick(lesson.title, locale),
    hanzi: lesson.hanzi,
    meta: t('minutes', { count: nf.format(lesson.minutes) }),
    state: lesson.state,
  }));
}

export interface RealLessonInput {
  id: string;
  number: number;
  title: Parameters<typeof pick>[0];
  hanzi: string | null;
  isFreePreview: boolean;
  thumbnail: ImageRef | null;
}

/**
 * Catalog lessons for the level page. `access` is what the API said this
 * viewer may do (see `getLevelAccess`); without a confirmed answer the view
 * fails closed and every lesson is locked. "Done" and "next" arrive with progress.
 */
export async function toCatalogPathLessons(
  lessons: RealLessonInput[],
  locale: Locale,
  access: Map<string, LessonAccess> = new Map(),
  /** Where an open or preview lesson goes; locked lessons never link. */
  hrefFor?: (lessonId: string) => string,
): Promise<PathLesson[]> {
  const t = await getTranslations({ locale, namespace: 'Path' });
  const nf = numberFormat(locale);

  return lessons.map((lesson) => ({
    id: lesson.id,
    number: t('lessonNumber', { n: nf.format(lesson.number) }),
    title: pick(lesson.title, locale),
    hanzi: lesson.hanzi ?? '',
    thumbnail: lesson.thumbnail,
    state: pathStateFor(lesson, access.get(lesson.id)),
    href: hrefFor?.(lesson.id),
  }));
}
