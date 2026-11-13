import { Check, CircleAlert } from 'lucide-react';

import { QuestionType } from '@app/shared';

const rowBase =
  'flex min-h-14 items-center gap-4 rounded-2xl bg-glaze-bright px-4 py-3 text-lg text-deep';

/** The 22px indicator: a dot for single and true/false, a square for multiple. */
export function Indicator({
  multiple,
  selected,
}: {
  multiple: boolean;
  selected: boolean;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-indicator={multiple ? 'square' : 'dot'}
      data-selected={selected ? 'true' : 'false'}
      className={`grid size-[22px] shrink-0 place-items-center border-2 ${
        multiple ? 'rounded-md' : 'rounded-full'
      } ${selected ? 'border-deep bg-deep text-glaze' : 'border-cobalt bg-transparent'}`}
    >
      {selected ? (
        multiple ? (
          <Check className="size-3.5" strokeWidth={3.5} />
        ) : (
          <span className="size-2 rounded-full bg-glaze" />
        )
      ) : null}
    </span>
  );
}

interface OptionRowProps {
  type: QuestionType;
  /** Radio group name (one per question). */
  name: string;
  id: string;
  text: string;
  checked: boolean;
  onChange: () => void;
  lang?: string;
}

/** A selectable answer: the whole row is the label of a native radio or checkbox. */
export function OptionRow({
  checked,
  id,
  lang,
  name,
  onChange,
  text,
  type,
}: OptionRowProps): React.JSX.Element {
  const multiple = type === QuestionType.MULTIPLE;
  return (
    <label
      htmlFor={id}
      className={`${rowBase} cursor-pointer transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-glaze has-[:focus-visible]:shadow-[0_0_0_5px_var(--color-cobalt-mid)] ${
        checked
          ? 'border-2 border-deep'
          : 'border-[1.5px] border-wash-strong hover:border-cobalt'
      }`}
    >
      <input
        id={id}
        type={multiple ? 'checkbox' : 'radio'}
        name={name}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <Indicator multiple={multiple} selected={checked} />
      <span lang={lang} className="min-w-0 flex-1">
        {text}
      </span>
    </label>
  );
}

export type OptionMarker = 'correct' | 'yours' | null;

/** A read-only option in the review, with icon and label for its marker. */
export function ReviewOptionRow({
  chosen,
  correctLabel,
  marker,
  multiple,
  text,
  yoursLabel,
  selectedLabel,
}: {
  multiple: boolean;
  text: string;
  chosen: boolean;
  marker: OptionMarker;
  correctLabel: string;
  yoursLabel: string;
  selectedLabel: string;
}): React.JSX.Element {
  return (
    <li
      data-chosen={chosen ? 'true' : 'false'}
      data-marker={marker ?? 'none'}
      className={`${rowBase} ${
        chosen ? 'border-2 border-deep' : 'border-[1.5px] border-wash-strong'
      }`}
    >
      <Indicator multiple={multiple} selected={chosen} />
      <span className="min-w-0 flex-1">
        {marker === 'correct' ? (
          <span className="sr-only">{correctLabel}: </span>
        ) : null}
        {marker === 'yours' ? (
          <span className="sr-only">{yoursLabel}: </span>
        ) : null}
        {chosen ? <span className="sr-only">{selectedLabel}: </span> : null}
        {text}
      </span>
      {marker === 'correct' ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-deep">
          <Check aria-hidden="true" className="size-4" strokeWidth={3} />
          {correctLabel}
        </span>
      ) : null}
      {marker === 'yours' ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-deep">
          <CircleAlert aria-hidden="true" className="size-4" />
          {yoursLabel}
        </span>
      ) : null}
    </li>
  );
}
