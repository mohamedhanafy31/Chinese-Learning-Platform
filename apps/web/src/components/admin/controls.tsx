'use client';

import { Check } from 'lucide-react';

import {
  FieldErrorMessage,
  baseInput,
} from '@/components/auth/form-controls';
import type { LocalizedInput } from '@/lib/localized';

export const labelClass = 'mb-2 block text-sm font-semibold text-deep';

export const primaryButton =
  'inline-flex min-h-14 items-center justify-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt disabled:cursor-not-allowed disabled:bg-wash disabled:text-cobalt';

/** The secondary action: a text button with a wash-strong underline. */
export const secondaryButton =
  'inline-flex min-h-11 items-center justify-center px-2 text-cobalt underline decoration-wash-strong underline-offset-8 transition-colors hover:text-deep disabled:cursor-not-allowed disabled:text-unfired-ink disabled:no-underline';

export const roundIconButton =
  'grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-wash-strong text-cobalt transition-colors hover:border-cobalt hover:bg-glaze-shade hover:text-deep disabled:cursor-not-allowed disabled:border-dashed disabled:border-unfired disabled:bg-transparent disabled:text-unfired-ink';

function inputState(error: string | undefined): string {
  return error ? 'border-2 border-deep' : 'border-[1.5px] border-wash-strong';
}

function describedBy(
  id: string,
  error: string | undefined,
  helper: string | undefined,
): string | undefined {
  if (error) return `${id}-error`;
  return helper ? `${id}-helper` : undefined;
}

interface BaseFieldProps {
  id: string;
  label: string;
  helper?: string;
  error?: string;
  disabled?: boolean;
  lang?: string;
  dir?: 'ltr' | 'rtl';
}

export function TextField({
  disabled,
  dir,
  error,
  helper,
  id,
  inputMode,
  label,
  lang,
  onChange,
  value,
  autoComplete = 'off',
  placeholder,
}: BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  placeholder?: string;
}): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        lang={lang}
        dir={dir}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, helper)}
        className={`${baseInput} ${inputState(error)} disabled:cursor-not-allowed disabled:bg-glaze-shade disabled:text-unfired-ink`}
      />
      {helper && !error ? (
        <p id={`${id}-helper`} className="mt-2 text-sm text-cobalt">
          {helper}
        </p>
      ) : null}
      {error ? <FieldErrorMessage id={`${id}-error`} message={error} /> : null}
    </div>
  );
}

export function TextAreaField({
  dir,
  error,
  helper,
  id,
  label,
  lang,
  onChange,
  value,
}: BaseFieldProps & {
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        lang={lang}
        dir={dir}
        rows={4}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy(id, error, helper)}
        className={`${baseInput} min-h-28 py-3 leading-relaxed ${inputState(error)}`}
      />
      {helper && !error ? (
        <p id={`${id}-helper`} className="mt-2 text-sm text-cobalt">
          {helper}
        </p>
      ) : null}
      {error ? <FieldErrorMessage id={`${id}-error`} message={error} /> : null}
    </div>
  );
}

export interface LocaleNames {
  ar: string;
  en: string;
  zh: string;
}

const localeAttributes = {
  ar: { lang: 'ar', dir: 'rtl' },
  en: { lang: 'en', dir: 'ltr' },
  zh: { lang: 'zh', dir: 'ltr' },
} as const;

/** One localized field as three labelled inputs: Arabic, English, Chinese. */
export function LocalizedFieldset({
  errors,
  helper,
  idPrefix,
  legend,
  multiline = false,
  names,
  onChange,
  values,
}: {
  idPrefix: string;
  legend: string;
  helper?: string;
  multiline?: boolean;
  names: LocaleNames;
  values: LocalizedInput;
  errors?: Partial<Record<keyof LocalizedInput, string>>;
  onChange: (next: LocalizedInput) => void;
}): React.JSX.Element {
  const order = ['ar', 'en', 'zh'] as const;
  const Field = multiline ? TextAreaField : TextField;
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-deep">{legend}</legend>
      {helper ? <p className="mt-1 text-sm text-cobalt">{helper}</p> : null}
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        {order.map((code) => (
          <Field
            key={code}
            id={`${idPrefix}-${code}`}
            label={names[code]}
            value={values[code]}
            error={errors?.[code]}
            lang={localeAttributes[code].lang}
            dir={localeAttributes[code].dir}
            onChange={(value) => onChange({ ...values, [code]: value })}
          />
        ))}
      </div>
    </fieldset>
  );
}

export function CheckboxField({
  checked,
  helper,
  id,
  label,
  onChange,
}: {
  id: string;
  label: string;
  helper?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={helper ? `${id}-helper` : undefined}
        className="mt-1 size-6 shrink-0 cursor-pointer rounded-md border-[1.5px] border-wash-strong accent-deep"
      />
      <div>
        <label htmlFor={id} className="cursor-pointer font-semibold text-deep">
          {label}
        </label>
        {helper ? (
          <p id={`${id}-helper`} className="mt-1 text-sm text-cobalt">
            {helper}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Inline, polite confirmation. Always rendered so screen readers pick it up. */
export function StatusLine({
  message,
}: {
  message: string | null;
}): React.JSX.Element {
  return (
    <p
      role="status"
      data-process-feedback={message ? '' : undefined}
      className={`flex min-h-6 items-center gap-2 text-sm font-semibold text-cobalt ${
        message ? '' : 'sr-only'
      }`}
    >
      {message ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
      {message}
    </p>
  );
}
