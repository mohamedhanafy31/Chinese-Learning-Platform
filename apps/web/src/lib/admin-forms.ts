import {
  MAX_LEVEL_TOPICS,
  createLessonRequestSchema,
  createLevelRequestSchema,
  type CreateLessonRequest,
  type CreateLevelRequest,
} from '@app/shared';

import {
  fromLocalizedInput,
  isLocalizedInputBlank,
  type LocalizedInput,
} from '@/lib/localized';
import { parsePriceInput } from '@/lib/price';

export type FieldErrorCode =
  | 'required'
  | 'tooLong'
  | 'invalid'
  | 'slugInvalid'
  | 'hanziTooLong'
  | 'priceInvalid'
  | 'priceDecimals'
  | 'priceSeparator'
  | 'priceTooLarge';

/** Keys look like "slug", "title.en", "topics.2.en", "price". */
export type FieldErrors = Record<string, FieldErrorCode>;

export interface TopicRow extends LocalizedInput {
  key: string;
}

export interface LevelFormValues {
  slug: string;
  hanzi: string;
  title: LocalizedInput;
  summary: LocalizedInput;
  topics: TopicRow[];
  price: string;
  coverImageId: string | null;
}

export interface LessonFormValues {
  title: LocalizedInput;
  description: LocalizedInput;
  hanzi: string;
  isFreePreview: boolean;
  thumbnailId: string | null;
}

export type BuildResult<T> =
  | { ok: true; payload: T }
  | { ok: false; errors: FieldErrors };

interface Issue {
  path: PropertyKey[];
  code: string;
}

function issueCode(path: string, issue: Issue, hanziBlank: boolean): FieldErrorCode {
  if (path === 'slug') return 'slugInvalid';
  if (path === 'hanzi') return hanziBlank ? 'required' : 'hanziTooLong';
  if (issue.code === 'too_small') return 'required';
  if (issue.code === 'too_big') return 'tooLong';
  return 'invalid';
}

function toErrors(issues: Issue[], hanziBlank: boolean): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const path = issue.path.map(String).join('.');
    errors[path] ??= issueCode(path, issue, hanziBlank);
  }
  return errors;
}

const priceReason = {
  invalid: 'priceInvalid',
  decimals: 'priceDecimals',
  separator: 'priceSeparator',
  'too-large': 'priceTooLarge',
} as const;

/**
 * Validates the level form with the same shared schema the API uses, so the
 * client and server can never disagree about what a valid level is. The price
 * is converted from EGP text to piasters by string parsing.
 */
export function buildLevelPayload(
  values: LevelFormValues,
): BuildResult<CreateLevelRequest> {
  const errors: FieldErrors = {};
  const price = parsePriceInput(values.price);
  if (!price.ok) errors.price = priceReason[price.reason];

  if (values.topics.length > MAX_LEVEL_TOPICS) errors.topics = 'tooLong';
  const topics = values.topics
    .filter((topic) => !isLocalizedInputBlank(topic))
    .map(fromLocalizedInput);

  const result = createLevelRequestSchema.safeParse({
    slug: values.slug.trim(),
    hanzi: values.hanzi,
    title: fromLocalizedInput(values.title),
    summary: fromLocalizedInput(values.summary),
    topics,
    priceMinor: price.ok ? price.minor : null,
    coverImageId: values.coverImageId,
  });

  if (!result.success) {
    // Topic errors were computed on the filtered list; remap to row indexes.
    const keptRows = values.topics
      .map((topic, index) => ({ topic, index }))
      .filter(({ topic }) => !isLocalizedInputBlank(topic))
      .map(({ index }) => index);
    const schemaErrors = toErrors(
      result.error.issues.map((issue) =>
        issue.path[0] === 'topics' && typeof issue.path[1] === 'number'
          ? {
              ...issue,
              path: [
                'topics',
                keptRows[issue.path[1]] ?? issue.path[1],
                ...issue.path.slice(2),
              ],
            }
          : issue,
      ),
      values.hanzi.trim() === '',
    );
    Object.assign(errors, schemaErrors);
  }

  if (Object.keys(errors).length > 0 || !result.success) {
    return { ok: false, errors };
  }
  return { ok: true, payload: result.data };
}

export function buildLessonPayload(
  values: LessonFormValues,
): BuildResult<CreateLessonRequest> {
  const result = createLessonRequestSchema.safeParse({
    title: fromLocalizedInput(values.title),
    description: isLocalizedInputBlank(values.description)
      ? null
      : fromLocalizedInput(values.description),
    hanzi: values.hanzi.trim() === '' ? null : values.hanzi,
    isFreePreview: values.isFreePreview,
    thumbnailId: values.thumbnailId,
  });
  if (!result.success) {
    return {
      ok: false,
      errors: toErrors(result.error.issues, values.hanzi.trim() === ''),
    };
  }
  return { ok: true, payload: result.data };
}
