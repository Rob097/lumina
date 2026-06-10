'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS, activeNavKey } from '@lumina/ui';
import { Icon } from '@/components/ui/Icon';
import { Menu } from '@/components/ui/Menu';
import { EnvToggle } from './EnvToggle';
import { ThemeToggle } from './ThemeToggle';

/** Sticky topbar — title derived from the active route, env + theme toggles, notifications, account. */
export function Topbar({ accountInitials }: { accountInitials: string }) {
  const key = activeNavKey(usePathname());
  const title = NAV_ITEMS.find((i) => i.key === key)?.label ?? 'LUMINA';

  return (
    <header className="topbar">
      <div className="grow">
        <h1>{title}</h1>
      </div>
      <EnvToggle />
      {/* Search is not implemented yet — disabled so it doesn't read as broken. */}
      <div className="top-search is-disabled" title="Search is coming soon">
        <Icon name="search" size={16} strokeWidth={2} />
        <input className="input" placeholder="Search…" aria-label="Search" disabled />
      </div>
      <ThemeToggle />

      <Menu
        triggerClassName="icon-btn"
        ariaLabel="Notifications"
        trigger={<Icon name="bell" size={17} strokeWidth={1.8} />}
      >
        <div className="menu-head">Notifications</div>
        <div className="menu-empty">You&apos;re all caught up — no notifications yet.</div>
      </Menu>

      <Menu triggerClassName="avatar" ariaLabel="Account menu" trigger={accountInitials}>
        <Link className="menu-item" href="/settings" role="menuitem">
          <Icon name="settings" size={15} strokeWidth={1.8} />
          Account settings
        </Link>
        <Link className="menu-item" href="/billing" role="menuitem">
          <Icon name="billing" size={15} strokeWidth={1.8} />
          Credits &amp; billing
        </Link>
        <div className="menu-sep" />
        <form action="/auth/signout" method="post">
          <button className="menu-item menu-item-danger" type="submit" role="menuitem">
            <Icon name="settings" size={15} strokeWidth={1.8} />
            Sign out
          </button>
        </form>
      </Menu>
    </header>
  );
}
