import { VIDEO_COMPLETE_PERCENT } from '@app/shared';

export interface CompletionInput {
  /** The lesson has a video the learner must watch. */
  hasVideo: boolean;
  /** Whole seconds of the video watched. */
  videoCovered: number;
  /** Video length in whole seconds; 0 or less means unknown. */
  duration: number;
  /** The lesson's live quizzes, each with whether one attempt passed. */
  quizzes: readonly { passed: boolean }[];
}

/** Integer math: `covered * 100 >= duration * 90`, no float rounding. */
export function isVideoWatched(covered: number, duration: number): boolean {
  return duration > 0 && covered * 100 >= duration * VIDEO_COMPLETE_PERCENT;
}

/** Whole-percent watched, never above 100. */
export function watchedPercent(covered: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.min(100, Math.floor((covered * 100) / duration));
}

/**
 * The completion rule: the video is at least 90 % watched AND every live quiz
 * has a passing attempt. A lesson without a video needs only its quizzes, one
 * without quizzes only its video. With neither it is complete by definition;
 * the service only applies that when an enrolled learner opens the lesson.
 */
export function isLessonComplete({
  hasVideo,
  videoCovered,
  duration,
  quizzes,
}: CompletionInput): boolean {
  const videoDone = !hasVideo || isVideoWatched(videoCovered, duration);
  return videoDone && quizzes.every((quiz) => quiz.passed);
}
