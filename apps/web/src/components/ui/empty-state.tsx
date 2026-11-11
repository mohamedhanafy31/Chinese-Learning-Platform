import Link from 'next/link';

/**
 * An empty list, drawn as an unfired block: dashed `unfired` line, 1rem
 * corners, `cobalt` text, and at most one helpful action. The dashed line is
 * atmosphere only; the words carry the meaning.
 */
export function EmptyState({
  action,
  body,
  className = '',
  title,
}: {
  title?: string;
  body: string;
  action?: { href: string; label: string };
  className?: string;
}): React.JSX.Element {
  return (
    <div
      data-empty-state
      className={`rounded-2xl border-2 border-dashed border-unfired px-6 py-12 text-center text-cobalt ${className}`}
    >
      {title ? (
        <p className="text-xl font-semibold text-deep">{title}</p>
      ) : null}
      <p
        className={`mx-auto max-w-[34rem] text-lg leading-[1.8] ${title ? 'mt-2' : ''}`}
      >
        {body}
      </p>
      {action ? (
        <Link
          href={action.href}
          className="mt-6 inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 transition-colors hover:text-deep"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
