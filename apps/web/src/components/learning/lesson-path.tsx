import { Check, Lock, Play } from 'lucide-react';
import Link from 'next/link';

import { Seal } from '@/components/porcelain/seal';

export type PathState = 'done' | 'next' | 'locked' | 'preview' | 'open';

export interface PathLesson {
  id: string;
  number: string;
  title: string;
  hanzi?: string;
  meta?: string;
  state: PathState;
  href?: string;
}

export interface PathLabels {
  done: string;
  next: string;
  locked: string;
  preview: string;
  open: string;
  start: string;
  sealedBy: string;
}

interface LessonPathProps {
  lessons: PathLesson[];
  labels: PathLabels;
  title: string;
}

/**
 * The level's lessons as one unbroken cobalt band. Completed lessons are
 * "fired" (deep cobalt, sealed); locked ones are still unfired underglaze line.
 */
export function LessonPath({
  lessons,
  labels,
  title,
}: LessonPathProps): React.JSX.Element {
  return (
    <ol aria-label={title} data-reveal="path" className="relative">
      <span
        aria-hidden="true"
        data-path-spine=""
        className="absolute inset-y-6 start-[1.375rem] w-1 rounded-full bg-cobalt sm:start-[1.625rem]"
      />
      {lessons.map((lesson, index) => {
        const fired = lesson.state === 'done';
        const next = lesson.state === 'next';
        const locked = lesson.state === 'locked';
        const stateLabel = labels[lesson.state];

        const row = (
          <div
            className={`relative flex items-center gap-4 rounded-2xl py-4 pe-4 ps-0 sm:gap-6 ${
              next ? 'bg-white shadow-[0_18px_40px_-24px_rgb(14_35_102/0.45)]' : ''
            }`}
          >
            <span
              data-path-node=""
              className={`relative z-10 grid size-11 shrink-0 place-items-center rounded-full sm:size-[3.25rem] ${
                fired
                  ? 'bg-deep text-glaze'
                  : next
                    ? 'bg-seal text-glaze ring-4 ring-glaze'
                    : locked
                      ? 'border-2 border-dashed border-unfired bg-glaze text-unfired-ink'
                      : 'border-2 border-cobalt bg-glaze text-cobalt'
              }`}
            >
              {fired ? (
                <Check aria-hidden="true" className="size-5" strokeWidth={2.5} />
              ) : locked ? (
                <Lock aria-hidden="true" className="size-5" strokeWidth={2} />
              ) : (
                <Play aria-hidden="true" className="size-5 rtl:-scale-x-100" strokeWidth={2.25} />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`truncate text-lg font-semibold sm:text-xl ${
                  locked ? 'text-unfired-ink' : 'text-deep'
                }`}
              >
                {lesson.title}
              </p>
              <p
                className={`mt-0.5 text-sm tabular ${locked ? 'text-unfired-ink' : 'text-cobalt'}`}
              >
                {lesson.meta ? `${lesson.number} · ${lesson.meta}` : lesson.number}
              </p>
            </div>

            {lesson.hanzi ? (
              <span
                lang="zh"
                aria-hidden="true"
                className={`font-brush hidden text-3xl sm:block ${
                  locked ? 'text-unfired/70' : fired ? 'text-deep' : 'text-cobalt'
                }`}
              >
                {lesson.hanzi}
              </span>
            ) : null}

            <span className="flex shrink-0 items-center gap-2">
              {fired ? (
                <Seal size={30} label={labels.sealedBy} />
              ) : next ? (
                <span className="rounded-full bg-seal px-4 py-2 text-sm font-semibold text-glaze">
                  {labels.start}
                </span>
              ) : (
                <span
                  className={`text-sm ${locked ? 'text-unfired-ink' : 'text-cobalt'}`}
                >
                  {stateLabel}
                </span>
              )}
            </span>
            <span className="sr-only">{stateLabel}</span>
          </div>
        );

        return (
          <li
            key={lesson.id}
            id={lesson.id}
            data-path-row=""
            style={{ '--reveal-i': index } as React.CSSProperties}
            className="scroll-mt-24"
          >
            {lesson.href && !locked ? (
              <Link
                href={lesson.href}
                className="block rounded-2xl transition-colors hover:bg-white/70"
              >
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ol>
  );
}
