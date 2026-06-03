'use client';

import { useTheme } from '@/lib/providers';
import { Icon } from '@/components/ui/Icon';

/** Light/dark toggle (topbar). */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} strokeWidth={1.8} />
    </button>
  );
}
