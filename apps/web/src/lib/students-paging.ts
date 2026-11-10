export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** The students list URL for a search and page; defaults stay out of the URL. */
export function studentsHref(
  locale: string,
  query: string,
  page: number,
): string {
  const params = new URLSearchParams();
  const trimmed = query.trim();
  if (trimmed) params.set('query', trimmed);
  if (page > 1) params.set('page', String(page));
  const search = params.toString();
  return `/${locale}/admin/students${search ? `?${search}` : ''}`;
}

/** Reads a positive page number from a search param, defaulting to 1. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100_000
    ? parsed
    : 1;
}
