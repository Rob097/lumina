'use client';

import { usePathname } from 'next/navigation';
import { NAV_ITEMS, activeNavKey } from '@lumina/ui';
import { Icon } from '@/components/ui/Icon';
import { EnvToggle } from './EnvToggle';
import { ThemeToggle } from './ThemeToggle';

/** Sticky topbar — title derived from the active route, env + theme toggles, search, notifications. */
export function Topbar({ accountInitials }: { accountInitials: string }) {
  const key = activeNavKey(usePathname());
  const title = NAV_ITEMS.find((i) => i.key === key)?.label ?? 'LUMINA';

  return (
    <header className="topbar">
      <div className="grow">
        <h1>{title}</h1>
      </div>
      <EnvToggle />
      <div className="top-search">
        <Icon name="search" size={16} strokeWidth={2} />
        <input className="input" placeholder="Search…" aria-label="Search" />
      </div>
      <ThemeToggle />
      <button className="icon-btn" aria-label="Notifications">
        <Icon name="bell" size={17} strokeWidth={1.8} />
      </button>
      <span className="avatar">{accountInitials}</span>
    </header>
  );
}
