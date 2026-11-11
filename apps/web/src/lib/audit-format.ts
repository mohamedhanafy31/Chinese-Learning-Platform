import type { AuditEntry, Locale, LocalizedText } from '@app/shared';

import { pick } from '@/lib/localized';
import { formatEgp } from '@/lib/price';

/** The slice of a next-intl translator these helpers need. */
export interface AuditTranslator {
  (key: string, values?: Record<string, string>): string;
  has(key: string): boolean;
}

/** `level.publish` becomes `level_publish`: message keys cannot hold dots. */
export function auditMessageKey(action: string): string {
  return action.replace(/[^a-z0-9]+/gi, '_');
}

/**
 * The name an entry is about, in the reader's language. A deleted entity has
 * no label, so a level's slug (kept in the row) or a neutral word stands in.
 */
export function auditEntityName(
  t: AuditTranslator,
  entry: AuditEntry,
  locale: Locale,
): string {
  if (entry.entityLabel) return pick(entry.entityLabel, locale);
  const slug = entry.data.slug;
  if (typeof slug === 'string' && slug) return slug;
  return t('removedItem');
}

/** One readable sentence: «نشر المستوى «البداية»». */
export function auditPhrase(
  t: AuditTranslator,
  entry: AuditEntry,
  locale: Locale,
): string {
  const name = auditEntityName(t, entry, locale);
  const key = `actions.${auditMessageKey(entry.action)}`;
  return t.has(key)
    ? t(key, { name })
    : t('actions.unknown', { action: entry.action, name });
}

/** The admin page of the entity, when it still exists and has one. */
export function auditEntityHref(
  entry: AuditEntry,
  locale: Locale,
): string | null {
  if (entry.entity === 'Level' && entry.entityId === 'all') {
    return `/${locale}/admin/levels`;
  }
  if (!entry.entityLabel) return null;
  const folder: Record<string, string> = {
    Level: 'levels',
    Lesson: 'lessons',
    Quiz: 'quizzes',
    Student: 'students',
  };
  const section = folder[entry.entity];
  return section ? `/${locale}/admin/${section}/${entry.entityId}` : null;
}

export interface AuditDetail {
  field: string;
  /** Null when only the name of the changed field was recorded. */
  from: string | null;
  to: string | null;
}

function isLocalizedText(value: unknown): value is LocalizedText {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { en?: unknown }).en === 'string'
  );
}

/** A recorded value as text: titles in the reader's language, money in EGP. */
export function formatAuditValue(
  field: string,
  value: unknown,
  locale: Locale,
  yes: string,
  no: string,
): string {
  if (value === null || value === undefined) return '—';
  if (isLocalizedText(value)) return pick(value, locale);
  if (typeof value === 'boolean') return value ? yes : no;
  if (typeof value === 'number') {
    return field === 'priceMinor'
      ? formatEgp(value, locale)
      : new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : locale).format(value);
  }
  if (typeof value === 'string') return value;
  return '—';
}

/** What the "changed fields" disclosure lists, from the row's `data`. */
export function auditDetails(
  entry: AuditEntry,
  locale: Locale,
  yes: string,
  no: string,
): AuditDetail[] {
  const changed = Array.isArray(entry.data.changed)
    ? entry.data.changed.filter(
        (item): item is string => typeof item === 'string',
      )
    : [];
  const values =
    typeof entry.data.values === 'object' && entry.data.values !== null
      ? (entry.data.values as Record<string, { from?: unknown; to?: unknown }>)
      : {};
  return changed.map((field) => {
    const pair = values[field];
    return pair
      ? {
          field,
          from: formatAuditValue(field, pair.from, locale, yes, no),
          to: formatAuditValue(field, pair.to, locale, yes, no),
        }
      : { field, from: null, to: null };
  });
}

export interface AuditFilters {
  entity?: string;
  entityId?: string;
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
}

/** The audit page URL for a filter set and page; defaults stay out of it. */
export function auditHref(
  locale: string,
  filters: AuditFilters,
  page = 1,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  if (page > 1) params.set('page', String(page));
  const search = params.toString();
  return `/${locale}/admin/audit${search ? `?${search}` : ''}`;
}
