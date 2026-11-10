import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import { AttemptHistory } from '@/components/quiz/attempt-history';
import { ErrorGate, LevelGate, SignInGate } from '@/components/quiz/quiz-gates';
import { QuizSheet } from '@/components/quiz/quiz-sheet';
import { WriteOn } from '@/components/motion/write-on';
import { pick } from '@/lib/localized';
import { formatPercent, numberFormat } from '@/lib/numbers';
import { getAttempts, getQuiz } from '@/lib/quiz';
import { getCurrentUser } from '@/lib/session';

interface QuizPageProps {
  params: Promise<{
    locale: Locale;
    levelSlug: string;
    lessonId: string;
    quizId: string;
  }>;
}

export async function generateMetadata({
  params,
}: QuizPageProps): Promise<Metadata> {
  const { locale, quizId } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const result = await getQuiz(quizId);
  const robots = { index: false, follow: false };
  if (result.status === 'ok') {
    return {
      title: t('quizNamed', { quiz: pick(result.quiz.title, locale) }),
      robots,
    };
  }
  return { title: t('quiz'), robots };
}

export default async function QuizPage({
  params,
}: QuizPageProps): Promise<React.JSX.Element> {
  const { locale, levelSlug, lessonId, quizId } = await params;
  setRequestLocale(locale);
  const lessonPath = `/${locale}/learn/${levelSlug}/${lessonId}`;
  const here = `${lessonPath}/quiz/${quizId}`;

  const user = await getCurrentUser();
  if (!user) return <SignInGate locale={locale} next={here} />;

  const result = await getQuiz(quizId);
  if (result.status === 'not-found') notFound();
  if (result.status === 'login-required') {
    return <SignInGate locale={locale} next={here} />;
  }
  if (result.status === 'not-enrolled') {
    return <LevelGate locale={locale} levelSlug={levelSlug} />;
  }
  if (result.status === 'error') return <ErrorGate locale={locale} />;

  const { quiz } = result;
  if (quiz.lessonId !== lessonId) notFound();

  const t = await getTranslations('Quiz');
  const nf = numberFormat(locale);
  const attempts = await getAttempts(quizId);
  const title = pick(quiz.title, locale);
  const description = quiz.description ? pick(quiz.description, locale) : null;

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 sm:px-8 lg:pb-24 lg:pt-10">
      <Link
        href={lessonPath}
        className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
      >
        {t('backToLesson')}
      </Link>

      <div className="mx-auto mt-4 max-w-[44rem]">
        <h1 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
          <WriteOn text={title} />
        </h1>
        <p className="mt-3 text-cobalt tabular">
          {t('questions', {
            count: quiz.questionCount,
            n: nf.format(quiz.questionCount),
          })}
          {' · '}
          {t('passMark', { pass: formatPercent(quiz.passingScore, locale) })}
        </p>
        {description ? (
          <p className="mt-4 max-w-[34rem] text-lg leading-[1.85] text-cobalt">
            {description}
          </p>
        ) : null}

        <div className="mt-12">
          <QuizSheet
            quiz={quiz}
            lessonHref={lessonPath}
            loginHref={`/${locale}/login?${new URLSearchParams({ next: here })}`}
          />
        </div>

        <AttemptHistory attempts={attempts} basePath={here} locale={locale} />
      </div>
    </div>
  );
}
