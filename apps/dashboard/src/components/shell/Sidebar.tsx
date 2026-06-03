'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_GROUPS, NAV_ITEMS, activeNavKey } from '@lumina/ui';
import { Icon } from '@/components/ui/Icon';
import { compact } from '@/lib/format';
import type { CreditLevel } from '@/lib/shell';

export interface SidebarProps {
  merchant: { name: string; plan: string; initials: string };
  credits: { balance: number; usedPct: number; level: CreditLevel };
  account: { name: string; email: string; initials: string };
  counts?: Record<string, number>;
}

const BADGE = { ok: 'badge-neutral', warn: 'badge-warning', danger: 'badge-danger' } as const;
const FILL = { ok: '', warn: ' warn', danger: ' danger' } as const;

export function Sidebar({ merchant, credits, account, counts }: SidebarProps) {
  const active = activeNavKey(usePathname());

  return (
    <aside className="side">
      <div className="side-top">
        <button className="merchant-switch">
          <span className="merchant-logo">{merchant.initials}</span>
          <span>
            <span className="nm">{merchant.name}</span>
            <br />
            <span className="pl">{merchant.plan} plan</span>
          </span>
          <Icon name="chevron-updown" className="chev" size={16} strokeWidth={2} />
        </button>
      </div>

      <nav className="side-nav">
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="col" style={{ gap: 1 }}>
            {group.label ? <div className="nav-group-label">{group.label}</div> : null}
            {NAV_ITEMS.filter((i) => i.group === group.id).map((item) => {
              const count = counts?.[item.key];
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`nav-item${active === item.key ? ' active' : ''}`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                  {count != null ? <span className="count tnum">{compact(count)}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="side-foot">
        <div className="credit-pill">
          <div className="row1">
            <span className="lab">Credits remaining</span>
            <span className={`badge ${BADGE[credits.level]}`} style={{ height: 18, padding: '0 6px' }}>
              {credits.usedPct}% used
            </span>
          </div>
          <div className="val tnum">{compact(credits.balance)}</div>
          <div className="meter">
            <div className={`meter-fill${FILL[credits.level]}`} style={{ width: `${credits.usedPct}%` }} />
          </div>
        </div>
        <div className="account-row">
          <span className="avatar">{account.initials}</span>
          <span>
            <span className="nm">{account.name}</span>
            <br />
            <span className="em">{account.email}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
