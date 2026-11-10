import { useTranslations } from 'next-intl';

import type { QuizErrorKey } from '@/lib/quiz-errors';

/** Localized text for a failed quiz call (the quiz-specific codes, else the admin ones). */
export function useQuizErrorText(): (key: QuizErrorKey) => string {
  const tErrors = useTranslations('Admin.errors');
  const tQuiz = useTranslations('Admin.quiz.errors');
  return (key) => {
    switch (key) {
      case 'hasAttempts':
      case 'invalidOptions':
      case 'invalidImage':
        return tQuiz(key);
      default:
        return tErrors(key);
    }
  };
}
