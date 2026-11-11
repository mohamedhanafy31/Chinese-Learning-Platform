import type { PathState } from '@/components/learning/lesson-path';

export interface ProgressBarLabels {
  /** Names the whole bar. */
  bar: string;
  done: string;
  next: string;
  locked: string;
  preview: string;
  open: string;
}

/** Segment look per path state (DESIGN.md: Lesson Path, progress bar). */
const SEGMENT: Record<PathState, string> = {
  done: 'bg-deep',
  next: 'bg-seal',
  preview: 'bg-cobalt-mid',
  open: 'bg-cobalt',
  locked: 'border-2 border-dashed border-unfired bg-glaze',
};

/**
 * One 10px pill per lesson: fired `deep`, next `seal`, preview `cobalt-mid`,
 * locked a dashed `unfired` outline. Every segment names its state for screen
 * readers, so colour is never the only signal. The count above it is the
 * caller's (a tabular, locale-digit sentence).
 */
export function ProgressBar({
  labels,
  segments,
}: {
  segments: { id: string; state: PathState }[];
  labels: ProgressBarLabels;
}): React.JSX.Element {
  return (
    <ol
      aria-label={labels.bar}
      data-testid="progress-bar"
      className="flex gap-1.5"
    >
      {segments.map(({ id, state }) => (
        <li
          key={id}
          data-state={state}
          className={`h-2.5 min-w-3 flex-1 rounded-full ${SEGMENT[state]}`}
        >
          <span className="sr-only">{labels[state]}</span>
        </li>
      ))}
    </ol>
  );
}
