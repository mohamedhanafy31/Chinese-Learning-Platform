'use client';

import { CircleAlert, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

export const baseInput =
  'min-h-14 w-full rounded-2xl bg-glaze-bright px-4 text-lg text-deep placeholder:text-unfired-ink hover:border-cobalt';

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: FieldError;
  errorMessage: string;
  helper?: string;
  label: string;
  registration: UseFormRegisterReturn;
}

export function FormField({
  error,
  errorMessage,
  helper,
  id,
  label,
  registration,
  ...inputProps
}: FieldProps): React.JSX.Element {
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-deep"
      >
        {label}
      </label>
      <input
        {...inputProps}
        {...registration}
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? errorId : helper ? helperId : undefined}
        className={`${baseInput} ${error ? 'border-2 border-deep' : 'border-[1.5px] border-wash-strong'}`}
      />
      {helper && !error ? (
        <p id={helperId} className="mt-2 text-sm text-cobalt">
          {helper}
        </p>
      ) : null}
      {error ? <FieldErrorMessage id={errorId} message={errorMessage} /> : null}
    </div>
  );
}

interface PasswordFieldProps extends Omit<FieldProps, 'type'> {
  hideLabel: string;
  showLabel: string;
}

export function PasswordField({
  error,
  errorMessage,
  hideLabel,
  id,
  label,
  registration,
  showLabel,
  ...inputProps
}: PasswordFieldProps): React.JSX.Element {
  const [visible, setVisible] = useState(false);
  const errorId = `${id}-error`;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-semibold text-deep"
      >
        {label}
      </label>
      <div className="relative">
        <input
          {...inputProps}
          {...registration}
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`${baseInput} pe-14 ${error ? 'border-2 border-deep' : 'border-[1.5px] border-wash-strong'}`}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? hideLabel : showLabel}
          className="absolute end-1.5 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-cobalt hover:bg-glaze-shade hover:text-deep"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-5" />
          ) : (
            <Eye aria-hidden="true" className="size-5" />
          )}
        </button>
      </div>
      {error ? <FieldErrorMessage id={errorId} message={errorMessage} /> : null}
    </div>
  );
}

export function FormAlert({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      role="alert"
      data-process-feedback=""
      className="rounded-2xl border-s-4 border-deep bg-glaze-shade px-4 py-3 font-semibold leading-relaxed text-deep"
    >
      {children}
    </div>
  );
}

export function SubmitButton({
  label,
  pending,
  pendingLabel,
}: {
  label: string;
  pending: boolean;
  pendingLabel: string;
}): React.JSX.Element {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex min-h-14 w-full items-center justify-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt disabled:cursor-not-allowed disabled:bg-wash disabled:text-cobalt sm:w-auto"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export const secondaryLink =
  'inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 hover:text-deep';

export function FieldErrorMessage({
  id,
  message,
}: {
  id: string;
  message: string;
}): React.JSX.Element {
  return (
    <p
      id={id}
      data-process-feedback=""
      className="mt-2 flex items-start gap-2 text-sm font-semibold text-deep"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
