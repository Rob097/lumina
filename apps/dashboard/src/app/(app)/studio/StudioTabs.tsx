'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/studio', label: 'Overview', exact: true },
  { href: '/studio/new', label: 'New visualization', exact: false },
  { href: '/studio/clients', label: 'Clients', exact: false },
] as const;

/** Sub-navigation for the Studio section (#8). The sidebar keeps a single "Studio" item highlighted. */
export function StudioTabs() {
  const pathname = usePathname();
  return (
    <nav className="studio-tabs" aria-label="Studio sections">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`studio-tab ${active ? 'is-on' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
