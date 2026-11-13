import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import type { Locale } from '@app/shared';

import {
  primaryButtonClass,
  secondaryLinkClass,
} from '@/components/admin/classes';
import { AttemptHistory } from '@/components/quiz/attempt-history';
import { AttemptResult } from '@/components/quiz/attempt-result';
import { ErrorGate, SignInGate } from '@/components/quiz/quiz-gates';
import { WriteOn } from '@/components/motion/write-on';
import { formatDateTime } from '@/lib/format';
import { pick } from '@/lib/localized';
import { getPlayback } from '@/lib/learning';
import { getAttempt, getAttempts, getQuiz } from '@/lib/quiz';
import { reviewFromAttempt } from '@/lib/quiz-review';
import { getCurrentUser } from '@/lib/session';

interface AttemptPageProps {
  params: Promise<{
    locale: Locale;
    levelSlug: string;
    lessonId: string;
    quizId: string;
    attemptId: string;
  }>;
}

export async function generateMetadata({
  params,
}: AttemptPageProps): Promise<Metadata> {
  const { locale, quizId } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const result = await getQuiz(quizId);
  const robots = { index: false, follow: false };
  if (result.status === 'ok') {
    return {
      title: t('quizAttempt', { quiz: pick(result.quiz.title, locale) }),
      robots,
    };
  }
  return { title: t('quiz'), robots };
}

export default async function AttemptPage({
  params,
}: AttemptPageProps): Promise<React.JSX.Element> {
  const { locale, levelSlug, lessonId, quizId, attemptId } = await params;
  setRequestLocale(locale);
  const lessonPath = `/${locale}/learn/${levelSlug}/${lessonId}`;
  const quizPath = `${lessonPath}/quiz/${quizId}`;
  const here = `${quizPath}/attempts/${attemptId}`;

  const user = await getCurrentUser();
  if (!user) return <SignInGate locale={locale} next={here} />;

  const result = await getAttempt(attemptId);
  if (result.status === 'not-found') notFound();
  if (result.status === 'login-required') {
    return <SignInGate locale={locale} next={here} />;
  }
  if (result.status === 'error') return <ErrorGate locale={locale} />;
  const { detail } = result;
  if (detail.attempt.quizId !== quizId) notFound();

  const t = await getTranslations('Quiz');
  const quiz = await getQuiz(quizId);
  const attempts = await getAttempts(quizId);
  const playback = await getPlayback(lessonId);
  const playbackData =
    playback.status === 'ok' || playback.status === 'no-video'
      ? playback.data
      : null;
  const lessonIndex =
    playbackData?.siblings.findIndex((sibling) => sibling.id === lessonId) ??
    -1;
  const nextSibling =
    lessonIndex >= 0 ? playbackData?.siblings[lessonIndex + 1] : undefined;
  const nextLessonHref =
    nextSibling && nextSibling.access !== 'locked'
      ? `/${locale}/learn/${levelSlug}/${nextSibling.id}`
      : null;
  const title =
    quiz.status === 'ok' ? pick(quiz.quiz.title, locale) : t('quizFallback');

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 sm:px-8 lg:pb-24 lg:pt-10">
      <Link
        href={quizPath}
        className="inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
      >
        {t('backToQuiz')}
      </Link>
      <div className="mx-auto mt-4 max-w-[44rem]">
        <h1 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.1] text-deep">
          <WriteOn text={title} />
        </h1>
        <p className="mt-3 text-cobalt tabular">
          {t('attemptOn', {
            date: formatDateTime(detail.attempt.createdAt, locale),
          })}
        </p>
        <div className="mt-12">
          <AttemptResult model={reviewFromAttempt(detail)} />
        </div>
        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
          {detail.attempt.passed ? (
            <Link
              href={nextLessonHref ?? `/${locale}/levels/${levelSlug}`}
              className={primaryButtonClass}
            >
              {nextLessonHref ? t('nextLesson') : t('backToLevel')}
            </Link>
          ) : (
            <Link href={quizPath} className={primaryButtonClass}>
              {t('tryAgain')}
            </Link>
          )}
          {detail.attempt.passed ? (
            <Link
              href={quizPath}
              className="inline-flex min-h-11 items-center text-sm text-cobalt underline decoration-wash-strong underline-offset-4 hover:text-deep"
            >
              {t('tryAgain')}
            </Link>
          ) : null}
          <Link href={lessonPath} className={secondaryLinkClass}>
            {t('backToLesson')}
          </Link>
        </div>
        <AttemptHistory
          attempts={attempts}
          basePath={quizPath}
          currentId={attemptId}
          locale={locale}
        />
      </div>
    </div>
  );
}
