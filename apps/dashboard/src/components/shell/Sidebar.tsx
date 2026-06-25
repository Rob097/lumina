'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_GROUPS, NAV_ITEMS, activeNavKey } from '@lumina/ui';
import { Icon } from '@/components/ui/Icon';
import { Menu } from '@/components/ui/Menu';
import { BrandGlyph } from '@/components/ui/BrandMark';
import { useNav } from '@/lib/providers';
import { compact } from '@/lib/format';
import type { CreditLevel } from '@/lib/shell';
import { createWorkspaceAction, switchWorkspaceAction } from '@/lib/workspace-actions';

export interface WorkspaceOption {
  id: string;
  name: string;
  plan: string;
  initials: string;
}

export interface SidebarProps {
  merchant: { name: string; plan: string; initials: string };
  workspaces?: WorkspaceOption[];
  activeMerchantId?: string;
  credits: { balance: number; included: number; usedPct: number; level: CreditLevel };
  account: { name: string; email: string; initials: string };
  counts?: Record<string, number>;
}

const BADGE = { ok: 'badge-neutral', warn: 'badge-warning', danger: 'badge-danger' } as const;
const FILL = { ok: '', warn: ' warn', danger: ' danger' } as const;

export function Sidebar({
  merchant,
  workspaces = [],
  activeMerchantId,
  credits,
  account,
  counts,
}: SidebarProps) {
  const active = activeNavKey(usePathname());
  const { open, setOpen } = useNav();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  function switchTo(id: string) {
    if (id === activeMerchantId) return;
    setBusyLabel('Switching workspace…');
    // Land on Overview after switching — the current page may be workspace-specific (a generation,
    // a client…) and wouldn't exist in the new workspace. The navigation runs inside the transition,
    // so `pending` stays true (and the overlay shows) until the new workspace's Overview has rendered.
    startTransition(async () => {
      await switchWorkspaceAction(id);
      router.push('/overview');
      router.refresh();
    });
  }

  function createWorkspace() {
    const name = window.prompt('Name your new workspace');
    if (!name?.trim()) return;
    setBusyLabel('Creating workspace…');
    startTransition(async () => {
      const res = await createWorkspaceAction(name.trim());
      if (!res.ok) window.alert(res.error);
      else router.refresh();
    });
  }

  return (
    <>
      {pending && (
        <div className="ws-switching" role="status" aria-live="polite">
          <div className="spinner" />
          <span className="ws-switching-label">{busyLabel ?? 'Loading…'}</span>
        </div>
      )}
      {open && <div className="side-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside className={`side${open ? ' is-open' : ''}`}>
      <div className="side-top">
        <Menu
          triggerClassName="merchant-switch"
          ariaLabel="Workspace menu"
          align="left"
          panelClassName="menu-pop-wide"
          trigger={
            <>
              <BrandGlyph size={30} className="merchant-mark" />
              <span>
                <span className="nm">{merchant.name}</span>
                <br />
                <span className="pl">{merchant.plan} plan</span>
              </span>
              <Icon name="chevron-updown" className="chev" size={16} strokeWidth={2} />
            </>
          }
        >
          <div className="menu-head">Workspaces</div>
          {workspaces.map((w) => (
            <button
              key={w.id}
              type="button"
              role="menuitem"
              className={`menu-item${w.id === activeMerchantId ? ' is-current' : ''}`}
              disabled={pending}
              onClick={() => switchTo(w.id)}
            >
              <span className="merchant-logo sm">{w.initials}</span>
              <span className="grow">{w.name}</span>
              {w.id === activeMerchantId ? (
                <Icon name="arrow-up-right" size={14} strokeWidth={2} />
              ) : null}
            </button>
          ))}
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            disabled={pending}
            onClick={createWorkspace}
          >
            <Icon name="overview" size={15} strokeWidth={1.8} />
            New workspace
          </button>
          <Link className="menu-item" href="/settings" role="menuitem">
            <Icon name="settings" size={15} strokeWidth={1.8} />
            Workspace settings
          </Link>
        </Menu>
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
        <Link className="credit-pill" href="/billing" aria-label="Credits and billing">
          <div className="row1">
            <span className="lab">Credits left</span>
            <span className={`badge ${BADGE[credits.level]}`} style={{ height: 18, padding: '0 6px' }}>
              {credits.usedPct}% used
            </span>
          </div>
          <div className="val tnum">
            {compact(credits.balance)} <span className="val-total">/ {compact(credits.included)}</span>
          </div>
          <div className="meter">
            <div className={`meter-fill${FILL[credits.level]}`} style={{ width: `${credits.usedPct}%` }} />
          </div>
        </Link>
        <Link className="account-row" href="/settings" aria-label="Account settings">
          <span className="avatar">{account.initials}</span>
          <span>
            <span className="nm">{account.name}</span>
            <br />
            <span className="em">{account.email}</span>
          </span>
        </Link>
      </div>
      </aside>
    </>
  );
}
