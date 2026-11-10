import { getTranslations } from 'next-intl/server';

import type { Locale } from '@app/shared';

import type { PathLesson } from '@/components/learning/lesson-path';
import { pick, type SampleLevel } from '@/content/sample-course';
import { numberFormat } from '@/lib/numbers';

export async function toPathLessons(
  level: SampleLevel,
  locale: Locale,
): Promise<PathLesson[]> {
  const t = await getTranslations({ locale, namespace: 'Path' });
  const nf = numberFormat(locale);

  return level.lessons.map((lesson, index) => ({
    id: lesson.id,
    number: t('lessonNumber', { n: nf.format(index + 1) }),
    title: pick(lesson.title, locale),
    hanzi: lesson.hanzi,
    meta: t('minutes', { count: nf.format(lesson.minutes) }),
    state: lesson.state,
    href: `/${locale}/levels/${level.slug}#${lesson.id}`,
  }));
}
