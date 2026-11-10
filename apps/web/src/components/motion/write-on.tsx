import { Fragment } from 'react';

type WriteMode = 'word' | 'char';

interface WriteOnProps {
  text: string;
  /** 'word' for Arabic and Latin scripts, 'char' for Chinese brush lines. */
  mode?: WriteMode;
  /** Delay before the first stroke, in milliseconds. */
  delay?: number;
  /** Time between strokes, in milliseconds. */
  stagger?: number;
  className?: string;
}

function segments(text: string, mode: WriteMode): string[] {
  if (mode === 'char') {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (part) => part.segment);
  }
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

/**
 * Text that appears as if written by an unseen pen when it scrolls into view:
 * each word (or each hanzi) is uncovered by a soft ink edge travelling in the
 * reading direction. The words stay real text in the DOM, so they are indexed,
 * selectable and read normally; without JavaScript or with reduced motion they
 * are simply visible.
 */
export function WriteOn({
  text,
  mode = 'word',
  delay = 0,
  stagger,
  className,
}: WriteOnProps): React.JSX.Element {
  const step = stagger ?? (mode === 'char' ? 140 : 120);
  let index = 0;

  return (
    <span
      data-write={mode}
      className={className}
      style={{ '--ink-delay': `${delay}ms` } as React.CSSProperties}
    >
      {segments(text, mode).map((part, position) => {
        if (/^\s+$/.test(part)) {
          return <Fragment key={position}>{part}</Fragment>;
        }
        const order = index;
        index += 1;
        return (
          <span
            key={position}
            className="ink-stroke"
            style={{ '--ink-i': order, '--ink-step': `${step}ms` } as React.CSSProperties}
          >
            {part}
          </span>
        );
      })}
    </span>
  );
}
