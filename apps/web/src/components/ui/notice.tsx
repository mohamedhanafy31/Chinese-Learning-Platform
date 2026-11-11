import { CircleAlert } from 'lucide-react';

/**
 * An honest heads-up, in the form-level block style: a 1rem-rounded
 * `glaze-shade` block with a 4px `deep` inline-start border and an icon. It is
 * never red and never uses the seal.
 */
export function Notice({
  children,
  role = 'status',
  title,
}: {
  title?: string;
  children: React.ReactNode;
  role?: 'status' | 'alert';
}): React.JSX.Element {
  return (
    <div
      role={role}
      data-notice
      className="flex gap-3 rounded-2xl border-s-4 border-deep bg-glaze-shade px-4 py-3 leading-relaxed text-deep"
    >
      <CircleAlert aria-hidden="true" className="mt-1 size-5 shrink-0" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? 'mt-1 text-cobalt' : 'font-semibold'}>
          {children}
        </div>
      </div>
    </div>
  );
}
