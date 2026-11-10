'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { secondaryButton } from '@/components/admin/controls';

type CopyState = 'idle' | 'copied' | 'failed';

/** Copies one value to the clipboard and says, in words, how it went. */
export function CopyButton({
  copiedLabel,
  failedLabel,
  label,
  value,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  failedLabel: string;
}): React.JSX.Element {
  const [state, setState] = useState<CopyState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy(): Promise<void> {
    let next: CopyState = 'copied';
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      next = 'failed';
    }
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 4000);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <button
        type="button"
        onClick={() => void copy()}
        className={`${secondaryButton} gap-2`}
      >
        {state === 'copied' ? (
          <Check aria-hidden="true" className="size-5" />
        ) : (
          <Copy aria-hidden="true" className="size-5" />
        )}
        {label}
      </button>
      <p role="status" className="text-sm font-semibold text-cobalt">
        {state === 'copied'
          ? copiedLabel
          : state === 'failed'
            ? failedLabel
            : ''}
      </p>
    </div>
  );
}
