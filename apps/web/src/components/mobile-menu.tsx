'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

interface MobileMenuProps {
  openLabel: string;
  closeLabel: string;
  tone: 'on-cobalt' | 'on-glaze';
  children: React.ReactNode;
}

/** Disclosure menu for narrow screens; the full nav shows inline from md up. */
export function MobileMenu({
  openLabel,
  closeLabel,
  tone,
  children,
}: MobileMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const onCobalt = tone === 'on-cobalt';

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((value) => !value)}
        className={`grid size-11 place-items-center rounded-full ${
          onCobalt ? 'text-glaze hover:bg-cobalt' : 'text-deep hover:bg-glaze-shade'
        }`}
      >
        {open ? <X aria-hidden="true" className="size-6" /> : <Menu aria-hidden="true" className="size-6" />}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className={`absolute inset-x-0 top-full z-40 border-t px-4 pb-6 pt-2 shadow-[0_24px_40px_-20px_rgb(3_10_40/0.6)] ${
          onCobalt ? 'border-cobalt-mid bg-deep' : 'border-wash bg-glaze'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
