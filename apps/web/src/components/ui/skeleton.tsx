/**
 * A calm placeholder shape in `glaze-shade`. It pulses softly, except under
 * `prefers-reduced-motion`, where it stays still.
 */
export function Skeleton({
  className = '',
}: {
  className?: string;
}): React.JSX.Element {
  return (
    <div
      aria-hidden="true"
      data-skeleton
      className={`rounded-2xl bg-glaze-shade motion-safe:animate-pulse ${className}`}
    />
  );
}

/** Wraps a loading layout: one polite status for assistive technology. */
export function LoadingRegion({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}): React.JSX.Element {
  return (
    <div role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
