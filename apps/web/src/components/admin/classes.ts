/**
 * Class strings for server components. The matching client exports live in
 * `controls.tsx` and `auth/form-controls.tsx`; a server component cannot read
 * values exported from a client module, so the strings are kept here as well.
 */
export const inputClass =
  'min-h-14 w-full rounded-2xl border-[1.5px] border-wash-strong bg-glaze-bright px-4 text-lg text-deep placeholder:text-unfired-ink hover:border-cobalt';

export const primaryButtonClass =
  'inline-flex min-h-14 items-center justify-center rounded-full bg-deep px-8 text-lg font-semibold text-glaze transition-colors hover:bg-cobalt disabled:cursor-not-allowed disabled:bg-wash disabled:text-cobalt';

export const secondaryLinkClass =
  'inline-flex min-h-11 items-center text-cobalt underline decoration-wash-strong underline-offset-8 transition-colors hover:text-deep';
