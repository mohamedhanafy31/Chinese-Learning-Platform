'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import {
  adminLevelsResponseSchema,
  type AdminLevel,
  type Locale,
} from '@app/shared';

import { FormAlert } from '@/components/auth/form-controls';
import { roundIconButton } from '@/components/admin/controls';
import { catalogStatus, StatusBadge } from '@/components/admin/status-badge';
import { useReorder } from '@/components/admin/use-reorder';
import { pick } from '@/lib/localized';
import { numberFormat } from '@/lib/numbers';

export function LevelsList({
  levels,
  locale,
}: {
  levels: AdminLevel[];
  locale: Locale;
}): React.JSX.Element {
  const t = useTranslations('Admin.levels');
  const tStatus = useTranslations('Admin.status');
  const tErrors = useTranslations('Admin.errors');
  const router = useRouter();
  const pathname = usePathname();
  const nf = numberFormat(locale);

  const { errorKey, items, move, moved, pending } = useReorder(levels, {
    url: '/api/v1/admin/levels/order',
    parse: (data) => {
      const parsed = adminLevelsResponseSchema.safeParse(data);
      return parsed.success ? parsed.data.levels : null;
    },
    onUnauthenticated: () =>
      router.replace(
        `/${locale}/admin/login?next=${encodeURIComponent(pathname)}`,
      ),
  });

  const movedLevel = moved
    ? items.find((level) => level.id === moved.id)
    : null;

  return (
    <div>
      {errorKey ? (
        <div className="mb-6">
          <FormAlert>{tErrors(errorKey)}</FormAlert>
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {moved && movedLevel
          ? t('movedTo', {
              title: pick(movedLevel.title, locale),
              position: nf.format(moved.position),
            })
          : ''}
      </p>
      <ol aria-label={t('listLabel')} className="border-t-2 border-cobalt">
        {items.map((level, index) => {
          const title = pick(level.title, locale);
          return (
            <li
              key={level.id}
              data-reorder-id={level.id}
              className="border-b border-wash"
            >
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 py-5 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:px-2">
                <span
                  lang="zh"
                  aria-hidden="true"
                  className="font-brush whitespace-nowrap text-4xl leading-none text-cobalt sm:text-5xl"
                >
                  {level.hanzi}
                </span>
                <div className="min-w-0">
                  <Link
                    href={`/${locale}/admin/levels/${level.id}`}
                    className="text-xl font-semibold text-deep underline decoration-wash-strong underline-offset-4 hover:decoration-deep"
                  >
                    {title}
                  </Link>
                  <p className="mt-1 text-sm text-cobalt tabular">
                    {t('numberLabel', { n: nf.format(index + 1) })}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-cobalt">
                    <StatusBadge
                      status={catalogStatus(level)}
                      label={tStatus(catalogStatus(level))}
                    />
                    <span className="tabular">
                      {t('lessonsMeta', {
                        count: nf.format(level.lessonCount),
                      })}
                    </span>
                  </div>
                </div>
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
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
