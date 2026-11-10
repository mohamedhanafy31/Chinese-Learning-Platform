import { useId } from 'react';

interface SealProps {
  size?: number;
  /** Accessible name; omit when the seal is decorative. */
  label?: string;
  className?: string;
}

/**
 * Mazen's cinnabar seal (印章): 马 cut in relief with heavy carved strokes and
 * the chipped edge of a stamped impression. The only red in the world.
 */
export function Seal({
  size = 40,
  label,
  className,
}: SealProps): React.JSX.Element {
  const id = useId().replace(/:/g, '');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={`shrink-0 ${className ?? ''}`}
    >
      <defs>
        {/* chipped stone edge, coarse enough to read at 30px */}
        <filter id={`edge-${id}`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="4" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="9" />
        </filter>
        <filter id={`cut-${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.12" numOctaves="1" seed="8" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5" />
        </filter>
      </defs>
      <path
        d="M8 10 L50 6 L93 9 L95 52 L91 93 L48 95 L7 91 L5 48 Z"
        fill="var(--color-seal)"
        filter={`url(#edge-${id})`}
      />
      {/* simplified 马 in three heavy carved strokes */}
      <g
        fill="none"
        stroke="var(--color-glaze)"
        strokeWidth="10"
        strokeLinecap="square"
        strokeLinejoin="miter"
        filter={`url(#cut-${id})`}
      >
        <path d="M24 22 H64 V42" />
        <path d="M38 22 V56 H76 V72 C76 82 70 84 62 81" />
        <path d="M22 72 H60" />
      </g>
    </svg>
  );
}
