'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Lightweight dropdown menu: a trigger button + a popover panel that closes on outside-click or Escape.
 * Used for the topbar notifications/account menus and the sidebar workspace switcher.
 */
export function Menu({
  trigger,
  children,
  triggerClassName,
  ariaLabel,
  align = 'right',
  panelClassName,
}: {
  trigger: ReactNode;
  children: ReactNode;
  triggerClassName: string;
  ariaLabel: string;
  align?: 'left' | 'right';
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      <button
        type="button"
        className={triggerClassName}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          className={`menu-pop menu-${align}${panelClassName ? ` ${panelClassName}` : ''}`}
          role="menu"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
