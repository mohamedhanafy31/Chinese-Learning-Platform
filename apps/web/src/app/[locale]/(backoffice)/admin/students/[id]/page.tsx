import { CircleCheck, CircleSlash } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { AuditHistory } from '@/components/admin/audit-history';
import { secondaryLinkClass } from '@/components/admin/classes';
import { StudentStatusButton } from '@/components/admin/student-status-button';
import { getAdminStudent } from '@/lib/admin-api';
import { formatDate } from '@/lib/format';
import { requireUser } from '@/lib/protected-session';

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
  const student = await getAdminStudent(id);

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

      <AuditHistory
        entries={student.recentAudit}
        entity="Student"
        entityId={student.id}
        locale={locale}
      />
    </section>
  );
}
