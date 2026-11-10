import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { QuestionsList } from '@/components/admin/questions-list';
import { QuizLifecycle } from '@/components/admin/quiz-lifecycle';
import { QuizSettingsForm } from '@/components/admin/quiz-settings-form';
import { getAdminLesson, getAdminQuiz } from '@/lib/admin-api';
import { pick } from '@/lib/localized';
import { formatPercent, numberFormat } from '@/lib/numbers';
import { requireUser } from '@/lib/protected-session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('adminQuizEdit'),
    robots: { index: false, follow: false },
  };
}

export default async function EditQuizPage({
  params,
}: {
  params: Promise<{ locale: Locale; id: string }>;
}): Promise<React.JSX.Element> {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireUser(locale, `/${locale}/admin/quizzes/${id}`, true);
  const t = await getTranslations('Admin.quiz');
  const quiz = await getAdminQuiz(id);
  const lesson = await getAdminLesson(quiz.lessonId);
  const title = pick(quiz.title, locale);
  const nf = numberFormat(locale);

  return (
    <section className="mx-auto max-w-[1100px] px-4 py-14 sm:px-8 lg:py-20">
      <nav aria-label={t('breadcrumb')}>
        <Link
          href={`/${locale}/admin/lessons/${lesson.id}`}
          className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
        >
          {t('backToLesson', { lesson: pick(lesson.title, locale) })}
        </Link>
      </nav>
      <h1 className="mt-4 font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
        {title}
      </h1>
      <p className="mt-3 max-w-[34rem] text-lg leading-[1.8] text-cobalt tabular">
        {t('editSummary', {
          count: quiz.questionCount,
          n: nf.format(quiz.questionCount),
          points: nf.format(quiz.totalPoints),
          pass: formatPercent(quiz.passingScore, locale),
          attempts: nf.format(quiz.attemptCount),
        })}
      </p>

      <div className="mt-10 rounded-2xl bg-glaze-shade p-6">
        <h2 className="mb-4 text-xl font-semibold text-deep">
          {t('visibilityTitle')}
        </h2>
        <QuizLifecycle
          id={quiz.id}
          lessonId={lesson.id}
          locale={locale}
          title={title}
          archivedAt={quiz.archivedAt}
        />
      </div>

      <div className="mt-14">
        <h2 className="mb-6 text-xl font-semibold text-deep">
          {t('settingsTitle')}
        </h2>
        <QuizSettingsForm
          key={quiz.updatedAt}
          lessonId={lesson.id}
          locale={locale}
          quiz={quiz}
        />
      </div>

      <div className="mt-14">
        <h2 className="mb-6 text-xl font-semibold text-deep">
          {t('questionsTitle')}
        </h2>
        <QuestionsList
          locale={locale}
          quizId={quiz.id}
          questions={quiz.questions}
        />
      </div>
    </section>
  );
}
