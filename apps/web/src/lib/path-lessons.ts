import { getTranslations } from 'next-intl/server';

import type { Locale } from '@app/shared';

import type { PathLesson } from '@/components/learning/lesson-path';
import { samplePathLessons } from '@/content/sample-path';
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
}

/**
 * Catalog lessons for the level page. There is no enrollment or progress yet,
 * so a lesson is either a free preview or locked; "done" and "next" arrive
 * with enrollments and progress.
 */
export async function toCatalogPathLessons(
  lessons: RealLessonInput[],
  locale: Locale,
): Promise<PathLesson[]> {
  const t = await getTranslations({ locale, namespace: 'Path' });
  const nf = numberFormat(locale);

  return lessons.map((lesson) => ({
    id: lesson.id,
    number: t('lessonNumber', { n: nf.format(lesson.number) }),
    title: pick(lesson.title, locale),
    hanzi: lesson.hanzi ?? '',
    state: lesson.isFreePreview ? 'preview' : 'locked',
  }));
}
