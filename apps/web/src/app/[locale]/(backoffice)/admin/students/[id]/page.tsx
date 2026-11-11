import { CircleCheck, CircleSlash } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { secondaryLinkClass } from '@/components/admin/classes';
import {
  GrantLevelForm,
  type GrantOption,
} from '@/components/admin/grant-level-form';
import { AuditHistory } from '@/components/admin/audit-history';
import { RevokeEnrollmentButton } from '@/components/admin/revoke-enrollment-button';
import { StudentStatusButton } from '@/components/admin/student-status-button';
import { OrderStatusBadge } from '@/components/billing/order-status';
import { formatEgp } from '@/lib/price';
import { getAdminLevels, getAdminStudent } from '@/lib/admin-api';
import { formatDate } from '@/lib/format';
import { pick } from '@/lib/localized';
import { numberFormat } from '@/lib/numbers';
import { requireUser } from '@/lib/protected-session';
import { EmptyState } from '@/components/ui/empty-state';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('adminStudent'), robots: { index: false, follow: false } };
}

export default async function AdminStudentPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/students/${id}`, true);
  const t = await getTranslations('Admin.student');
  const tOrders = await getTranslations('Billing.orders');
  const nf = numberFormat(locale);
  const [student, levels] = await Promise.all([
    getAdminStudent(id),
    getAdminLevels(),
  ]);

  const owned = new Set(
    student.enrollments
      .filter((enrollment) => enrollment.revokedAt === null)
      .map((enrollment) => enrollment.levelId),
  );
  const options: GrantOption[] = levels
    .filter(
      (level) =>
        (level.isPublished || level.archivedAt !== null) &&
        !owned.has(level.id),
    )
    .map((level) => ({
      id: level.id,
      label: `${level.hanzi} · ${pick(level.title, locale)}${
        level.archivedAt ? ` (${t('grantArchivedSuffix')})` : ''
      }`,
    }));

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <Link href={`/${locale}/admin/students`} className={secondaryLinkClass}>
        {t('back')}
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
          {student.name}
        </h1>
        {student.isActive ? (
          <span
            data-testid="student-status"
            className="inline-flex items-center gap-1.5 rounded-full bg-deep px-3 py-1 text-sm font-semibold text-glaze"
          >
            <CircleCheck aria-hidden="true" className="size-4 shrink-0" />
            {t('accountActive')}
          </span>
        ) : (
          <span
            data-testid="student-status"
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-unfired px-3 py-1 text-sm font-semibold text-unfired-ink"
          >
            <CircleSlash aria-hidden="true" className="size-4 shrink-0" />
            {t('accountDeactivated')}
          </span>
        )}
      </div>
      <dl className="mt-5 grid max-w-[40rem] gap-x-8 gap-y-3 text-cobalt sm:grid-cols-[auto_minmax(0,1fr)]">
        <dt className="text-sm font-semibold text-deep">{t('email')}</dt>
        <dd className="break-words">
          <span dir="ltr" className="inline-block">
            {student.email}
          </span>
        </dd>
        <dt className="text-sm font-semibold text-deep">{t('phone')}</dt>
        <dd>
          <span dir="ltr" className="tabular inline-block">
            {student.phone}
          </span>
        </dd>
        <dt className="text-sm font-semibold text-deep">{t('joinedLabel')}</dt>
        <dd className="tabular">{formatDate(student.createdAt, locale)}</dd>
      </dl>
      <div className="mt-6">
        <StudentStatusButton
          studentId={student.id}
          studentName={student.name}
          isActive={student.isActive}
          locale={locale}
        />
      </div>

      <h2 className="mt-14 text-xl font-semibold text-deep">
        {t('enrollmentsTitle')}
      </h2>
      {student.enrollments.length === 0 ? (
        <EmptyState className="mt-4" body={t('enrollmentsEmpty')} />
      ) : (
        <ul
          aria-label={t('listLabel')}
          className="mt-4 border-t-2 border-cobalt"
        >
          {student.enrollments.map((enrollment) => {
            const title = pick(enrollment.level.title, locale);
            const active = enrollment.revokedAt === null;
            return (
              <li
                key={enrollment.id}
                data-enrollment={enrollment.level.slug}
                className="border-b border-wash"
              >
                <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 py-5 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:px-2">
                  <span
                    lang="zh"
                    aria-hidden="true"
                    className="font-brush whitespace-nowrap text-4xl leading-none text-cobalt sm:text-5xl"
                  >
                    {enrollment.level.hanzi}
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/${locale}/admin/levels/${enrollment.levelId}`}
                      className="text-xl font-semibold text-deep underline decoration-wash-strong underline-offset-4 hover:decoration-deep"
                    >
                      {title}
                    </Link>
                    <p className="mt-1 text-sm text-cobalt">
                      {t(`source${enrollment.source}`)}
                      {' · '}
                      {enrollment.grantedByName
                        ? t('grantedBy', { name: enrollment.grantedByName })
                        : t('noGrantedBy')}
                      {' · '}
                      <span className="tabular">
                        {t('enrolledOn', {
                          date: formatDate(enrollment.createdAt, locale),
                        })}
                      </span>
                    </p>
                    {enrollment.progress ? (
                      <p className="mt-2 text-sm font-semibold tabular text-deep">
                        {t('progressLine', {
                          done: nf.format(enrollment.progress.completed),
                          total: nf.format(enrollment.progress.total),
                        })}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-cobalt">
                      {active ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-deep px-3 py-1 font-semibold text-glaze">
                          <CircleCheck
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                          {t('statusActive')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-unfired px-3 py-1 font-semibold text-unfired-ink">
                          <CircleSlash
                            aria-hidden="true"
                            className="size-4 shrink-0"
                          />
                          {t('statusRevoked')}
                        </span>
                      )}
                      {enrollment.revokedAt ? (
                        <span className="tabular">
                          {t('revokedOn', {
                            date: formatDate(enrollment.revokedAt, locale),
                          })}
                        </span>
                      ) : null}
                    </div>
                    {enrollment.revokedAt ? (
                      <p className="mt-2 text-sm text-cobalt">
                        {enrollment.revokeReason
                          ? t('reasonLine', { reason: enrollment.revokeReason })
                          : t('noReason')}
                      </p>
                    ) : null}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    {active ? (
                      <RevokeEnrollmentButton
                        studentId={student.id}
                        levelId={enrollment.levelId}
                        levelTitle={title}
                        locale={locale}
                      />
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-14 text-xl font-semibold text-deep">
        {t('ordersTitle')}
      </h2>
      {student.orders.length === 0 ? (
        <EmptyState className="mt-4" body={t('ordersEmpty')} />
      ) : (
        <ul
          aria-label={t('ordersLabel')}
          className="mt-4 border-t-2 border-cobalt"
        >
          {student.orders.map((order) => (
            <li key={order.id} className="border-b border-wash">
              <Link
                href={`/${locale}/admin/orders/${order.id}`}
                className="grid gap-x-6 gap-y-2 py-4 hover:bg-glaze-bright sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-2"
              >
                <span className="min-w-0">
                  <span className="block text-lg font-semibold text-deep">
                    {pick(order.levelTitle, locale)}
                  </span>
                  <span className="block text-sm tabular text-cobalt">
                    {formatDate(order.createdAt, locale)}
                  </span>
                </span>
                <span className="font-semibold tabular text-deep">
                  {formatEgp(order.amountMinor, locale)}
                </span>
                <OrderStatusBadge
                  status={order.status}
                  label={tOrders(`status.${order.status}`)}
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-14 text-xl font-semibold text-deep">
        {t('grantTitle')}
      </h2>
      <p className="mb-5 mt-2 max-w-[34rem] text-cobalt">{t('grantIntro')}</p>
      <GrantLevelForm
        locale={locale}
        studentId={student.id}
        options={options}
      />

      <AuditHistory
        entries={student.recentAudit}
        entity="Student"
        entityId={student.id}
        locale={locale}
      />
    </section>
  );
}
