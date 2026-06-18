'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NotificationListResponse } from '@lumina/shared';
import { NAV_ITEMS, activeNavKey } from '@lumina/ui';
import { Icon } from '@/components/ui/Icon';
import { Menu } from '@/components/ui/Menu';
import { useNav } from '@/lib/providers';
import { NotificationsBell } from './NotificationsBell';
import { ThemeToggle } from './ThemeToggle';

/** Sticky topbar — title derived from the active route, env + theme toggles, notifications, account. */
export function Topbar({
  accountInitials,
  notifications,
}: {
  accountInitials: string;
  notifications: NotificationListResponse;
}) {
  const key = activeNavKey(usePathname());
  const title = NAV_ITEMS.find((i) => i.key === key)?.label ?? 'YuzuView';
  const { setOpen } = useNav();

  return (
    <header className="topbar">
      <button
        className="icon-btn nav-toggle"
        type="button"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Icon name="menu" size={18} strokeWidth={2} />
      </button>
      <div className="grow">
        <h1>{title}</h1>
      </div>
      <ThemeToggle />

      <NotificationsBell initial={notifications} />

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
