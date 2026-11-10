import { Archive, CircleCheck, PencilLine } from 'lucide-react';

export type CatalogStatus = 'draft' | 'published' | 'archived';

export function catalogStatus(item: {
  isPublished: boolean;
  archivedAt: string | null;
}): CatalogStatus {
  if (item.archivedAt) return 'archived';
  return item.isPublished ? 'published' : 'draft';
}

const styles: Record<CatalogStatus, string> = {
  published: 'bg-deep text-glaze',
  draft: 'border-2 border-cobalt text-cobalt',
  archived: 'border-2 border-dashed border-unfired text-unfired-ink',
};

/** Status is always text plus an icon, never colour alone. */
export function StatusBadge({
  label,
  status,
}: {
  label: string;
  status: CatalogStatus;
}): React.JSX.Element {
  const Icon =
    status === 'published'
      ? CircleCheck
      : status === 'archived'
        ? Archive
        : PencilLine;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${styles[status]}`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </span>
  );
}
