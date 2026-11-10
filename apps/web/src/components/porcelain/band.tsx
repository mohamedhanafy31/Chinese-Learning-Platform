import { useId } from 'react';

type BandKind = 'wave' | 'lotus';

interface BandProps {
  kind: BandKind;
  /** Colour of the painted motif. */
  ink?: string;
  /** Colour of the band ground; transparent shows what sits behind. */
  ground?: string;
  className?: string;
}

/**
 * A single painted border band, the way qinghua ware divides its zones:
 * a sea-wave band (海水纹) or a lotus-panel band (莲瓣纹).
 * Purely decorative.
 */
export function Band({
  kind,
  ink = 'var(--color-cobalt)',
  ground = 'transparent',
  className,
}: BandProps): React.JSX.Element {
  const patternId = `${kind}-${useId().replace(/:/g, '')}`;
  const height = kind === 'wave' ? 28 : 34;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      width="100%"
      height={height}
      style={{ display: 'block', background: ground }}
    >
      <defs>
        {kind === 'wave' ? (
          <pattern
            id={patternId}
            width="48"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 22 C8 22 10 8 20 8 C28 8 30 16 24 18 C20 19 18 15 21 13 M24 22 C32 22 34 8 44 8 C52 8 54 16 48 18 C44 19 42 15 45 13"
              fill="none"
              stroke={ink}
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path d="M0 25 H48" stroke={ink} strokeWidth="1.5" />
          </pattern>
        ) : (
          <pattern
            id={patternId}
            width="30"
            height="34"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M3 33 C3 18 13 10 15 3 C17 10 27 18 27 33"
              fill="none"
              stroke={ink}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M9 33 C9 24 14 18 15 13 C16 18 21 24 21 33"
              fill="none"
              stroke={ink}
              strokeWidth="1.25"
            />
            <path d="M0 33 H30" stroke={ink} strokeWidth="1.5" />
          </pattern>
        )}
      </defs>
      <rect width="100%" height={height} fill={`url(#${patternId})`} />
    </svg>
  );
}
