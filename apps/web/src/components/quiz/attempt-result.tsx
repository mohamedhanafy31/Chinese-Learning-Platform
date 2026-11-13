'use client';

import { Check, CircleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { QuestionType, type Locale } from '@app/shared';

import { ReviewOptionRow } from '@/components/quiz/option-row';
import { QuestionBody } from '@/components/quiz/question-head';
import { Seal } from '@/components/porcelain/seal';
import { pick } from '@/lib/localized';
import { formatPercent, numberFormat } from '@/lib/numbers';
import type { ReviewModel, ReviewQuestion } from '@/lib/quiz-review';

function ReviewItem({
  index,
  question,
  passed,
  total,
}: {
  index: number;
  question: ReviewQuestion;
  passed: boolean;
  total: number;
}): React.JSX.Element {
  const t = useTranslations('Quiz');
  const locale = useLocale() as Locale;
  const nf = numberFormat(locale);
  const multiple = question.type === QuestionType.MULTIPLE;
  const explanation =
    passed && question.explanation ? pick(question.explanation, locale) : null;
  const StatusIcon = question.correct ? Check : CircleAlert;

  return (
    <li
      data-testid="review-question"
      data-correct={question.correct ? 'true' : 'false'}
      className="border-t border-wash pt-10 first:border-t-0 first:pt-0"
    >
      <p className="text-sm tabular text-cobalt">
        {t('questionOf', { n: nf.format(index + 1), total: nf.format(total) })}
      </p>
      <QuestionBody
        prompt={pick(question.prompt, locale)}
        hanzi={question.hanzi}
        image={question.image}
      />
      <p className="mt-4 inline-flex items-center gap-2 font-semibold text-deep">
        <StatusIcon aria-hidden="true" className="size-5" strokeWidth={2.5} />
        {question.correct ? t('statusCorrect') : t('statusWrong')}
      </p>
      <ul className="mt-4 space-y-3">
        {question.options.map((option) => {
          const chosen = question.chosen.includes(option.id);
          return (
            <ReviewOptionRow
              key={option.id}
              multiple={multiple}
              text={pick(option.text, locale)}
              chosen={chosen}
              marker={
                passed
                  ? option.isCorrect
                    ? 'correct'
                    : chosen
                      ? 'yours'
                      : null
                  : null
              }
              correctLabel={t('correctAnswer')}
              yoursLabel={t('yourAnswer')}
              selectedLabel={t('selected')}
            />
          );
        })}
      </ul>
      {explanation ? (
        <div className="mt-4 rounded-2xl bg-glaze-shade p-5 leading-[1.8] text-deep">
          <p className="text-sm font-semibold">{t('explanation')}</p>
          <p className="mt-1">{explanation}</p>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Score, passed or not-yet line, the seal when passed, and the per-question
 * review. The heading takes focus when `focusHeading` is set (after submit).
 */
export function AttemptResult({
  focusHeading = false,
  model,
}: {
  model: ReviewModel;
  focusHeading?: boolean;
}): React.JSX.Element {
  const t = useTranslations('Quiz');
  const locale = useLocale() as Locale;
  const nf = numberFormat(locale);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const sealRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  // Seals added after load are not seen by the page-level motion observer.
  useEffect(() => {
    const seal = sealRef.current;
    if (!seal) return;
    const frame = requestAnimationFrame(() => {
      seal.dataset.inview = 'true';
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const pass = formatPercent(model.passingScore, locale);

  return (
    <div data-testid="attempt-result">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-[clamp(2.25rem,4.5vw,3.75rem)] leading-[1.1] text-deep tabular outline-none"
          >
            <span className="sr-only">{t('resultHeading')} </span>
            {formatPercent(model.score, locale)}
          </h2>
          <p className="mt-2 text-lg font-semibold text-deep">
            {model.passed
              ? t('passedLine', { pass })
              : t('notYetLine', { pass })}
          </p>
          <p className="mt-1 text-sm tabular text-cobalt">
            {t('points', {
              earned: nf.format(model.earnedPoints),
              total: nf.format(model.totalPoints),
            })}
          </p>
        </div>
        {model.passed ? (
          <span
            ref={sealRef}
            data-reveal="seal"
            suppressHydrationWarning
            data-testid="pass-seal"
          >
            <Seal size={72} label={t('sealedBy')} />
          </span>
        ) : null}
      </div>

      <h3 className="mt-12 text-xl font-semibold text-deep">
        {t('reviewTitle')}
      </h3>
      {!model.passed ? (
        <p className="mt-2 text-cobalt">{t('failedReviewHint')}</p>
      ) : null}
      <ol className="mt-6 space-y-12">
        {model.questions.map((question, index) => (
          <ReviewItem
            key={question.id}
            index={index}
            question={question}
            passed={model.passed}
            total={model.questions.length}
          />
        ))}
      </ol>
    </div>
  );
}
