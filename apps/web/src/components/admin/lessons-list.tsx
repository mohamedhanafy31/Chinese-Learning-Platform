'use client';

import { ChevronDown, ChevronUp, Play } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  adminLessonSchema,
  z,
  type AdminLesson,
  type Locale,
} from '@app/shared';

import { FormAlert } from '@/components/auth/form-controls';
import { roundIconButton } from '@/components/admin/controls';
import { catalogStatus, StatusBadge } from '@/components/admin/status-badge';
import { useReorder } from '@/components/admin/use-reorder';
import { pick } from '@/lib/localized';
import { numberFormat } from '@/lib/numbers';

const lessonsResponseSchema = z.object({ lessons: z.array(adminLessonSchema) });

export function LessonsList({
  lessons,
  levelId,
  locale,
}: {
  lessons: AdminLesson[];
  levelId: string;
  locale: Locale;
}): React.JSX.Element {
  const t = useTranslations('Admin.lessons');
  const tStatus = useTranslations('Admin.status');
  const tErrors = useTranslations('Admin.errors');
  const router = useRouter();
  const pathname = usePathname();
  const nf = numberFormat(locale);

  const { errorKey, items, move, moved, pending } = useReorder(lessons, {
    url: `/api/v1/admin/levels/${levelId}/lessons/order`,
    parse: (data) => {
      const parsed = lessonsResponseSchema.safeParse(data);
      return parsed.success ? parsed.data.lessons : null;
    },
    onUnauthenticated: () =>
      router.replace(
        `/${locale}/admin/login?next=${encodeURIComponent(pathname)}`,
      ),
  });

  const movedLesson = moved
    ? items.find((lesson) => lesson.id === moved.id)
    : null;

  return (
    <div>
      {errorKey ? (
        <div className="mb-6">
          <FormAlert>{tErrors(errorKey)}</FormAlert>
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {moved && movedLesson
          ? t('movedTo', {
              title: pick(movedLesson.title, locale),
              position: nf.format(moved.position),
            })
          : ''}
      </p>
      <ol aria-label={t('listLabel')} className="border-t-2 border-cobalt">
        {items.map((lesson, index) => {
          const title = pick(lesson.title, locale);
          const status = catalogStatus(lesson);
          return (
            <li
              key={lesson.id}
              data-reorder-id={lesson.id}
              className="border-b border-wash"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-4 sm:px-2">
                <div className="min-w-0">
                  <Link
                    href={`/${locale}/admin/lessons/${lesson.id}`}
                    className="text-lg font-semibold text-deep underline decoration-wash-strong underline-offset-4 hover:decoration-deep"
                  >
                    {title}
                  </Link>
                  <p className="mt-1 text-sm text-cobalt tabular">
                    {t('lessonNumber', { n: nf.format(index + 1) })}
                    {lesson.hanzi ? (
                      <>
                        {' · '}
                        <span lang="zh">{lesson.hanzi}</span>
                      </>
                    ) : null}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                    <StatusBadge status={status} label={tStatus(status)} />
                    {lesson.isFreePreview ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-cobalt">
                        <Play
                          aria-hidden="true"
                          className="size-4 rtl:-scale-x-100"
                        />
                        {t('freePreview')}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-move="up"
                    disabled={pending || index === 0}
                    aria-label={t('moveUp', { title })}
                    onClick={() => void move(index, -1)}
                    className={roundIconButton}
                  >
                    <ChevronUp aria-hidden="true" className="size-5" />
                  </button>
                  <button
                    type="button"
                    data-move="down"
                    disabled={pending || index === items.length - 1}
                    aria-label={t('moveDown', { title })}
                    onClick={() => void move(index, 1)}
                    className={roundIconButton}
                  >
                    <ChevronDown aria-hidden="true" className="size-5" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
