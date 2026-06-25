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
import {
  createWorkspaceAction,
  deleteWorkspaceAction,
  reactivateWorkspaceAction,
  switchWorkspaceAction,
} from '@/lib/workspace-actions';

export interface WorkspaceOption {
  id: string;
  name: string;
  plan: string;
  initials: string;
  suspended?: boolean;
  /** Whether the signed-in user owns this workspace's billing account (governs delete). */
  isAccountOwner?: boolean;
}

export interface SidebarProps {
  merchant: { name: string; plan: string; initials: string };
  workspaces?: WorkspaceOption[];
  activeMerchantId?: string;
  credits: { balance: number; included: number; usedPct: number; level: CreditLevel };
  account: { name: string; email: string; initials: string };
  counts?: Record<string, number>;
  /** Analytics is a Growth+ perk — hide its nav entry for plans that don't include it. */
  analyticsEnabled?: boolean;
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
  analyticsEnabled = true,
}: SidebarProps) {
  const active = activeNavKey(usePathname());
  const { open, setOpen } = useNav();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  // Delete-workspace confirmation (type-the-name, like Settings → Danger zone).
  const [del, setDel] = useState<WorkspaceOption | null>(null);
  const [typed, setTyped] = useState('');
  const [delError, setDelError] = useState<string | null>(null);

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

  function reactivate(id: string) {
    setBusyLabel('Reactivating workspace…');
    startTransition(async () => {
      const res = await reactivateWorkspaceAction(id);
      if (!res.ok) {
        window.alert(res.error);
        return;
      }
      await switchWorkspaceAction(id);
      router.push('/overview');
      router.refresh();
    });
  }

  function askDelete(w: WorkspaceOption) {
    setTyped('');
    setDelError(null);
    setDel(w);
  }

  function confirmDelete() {
    if (!del || typed.trim() !== del.name.trim()) return;
    setDelError(null);
    setBusyLabel('Deleting workspace…');
    startTransition(async () => {
      const res = await deleteWorkspaceAction(del.id);
      if (!res.ok) {
        setDelError(res.error);
        return;
      }
      setDel(null);
      // The active workspace may have changed (the API moved the cookie); land on Overview.
      router.push('/overview');
      router.refresh();
    });
  }

  const activeWorkspaces = workspaces.filter((w) => !w.suspended);
  const suspendedWorkspaces = workspaces.filter((w) => w.suspended);

  // A workspace is deletable by the account owner as long as removing it leaves at least one ACTIVE
  // workspace. (The sub-bearing-workspace guard is server-side — it surfaces as a modal error.)
  function canDelete(w: WorkspaceOption): boolean {
    if (!w.isAccountOwner || workspaces.length <= 1) return false;
    const isOnlyActive = !w.suspended && activeWorkspaces.length === 1;
    return !isOnlyActive;
  }

  return (
    <>
      {pending && (
        <div className="ws-switching" role="status" aria-live="polite">
          <div className="spinner" />
          <span className="ws-switching-label">{busyLabel ?? 'Loading…'}</span>
        </div>
      )}
      {del && (
        <div className="drawer-scrim" onClick={pending ? undefined : () => setDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header className="drawer-head">
              <h3>Delete this workspace?</h3>
            </header>
            <div className="drawer-body">
              <p className="t-secondary settings-p">
                This permanently erases <strong>{del.name}</strong> — its products, generations, and
                widget. This cannot be undone. Type the name to confirm.
              </p>
              <input
                className="input"
                placeholder={del.name}
                value={typed}
                disabled={pending}
                onChange={(e) => setTyped(e.target.value)}
              />
              {delError && <p className="field-error">{delError}</p>}
            </div>
            <footer className="drawer-foot">
              <button className="btn btn-ghost" type="button" onClick={() => setDel(null)} disabled={pending}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={pending || typed.trim() !== del.name.trim()}
                onClick={confirmDelete}
              >
                {pending ? 'Deleting…' : 'Delete forever'}
              </button>
            </footer>
          </div>
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
          {activeWorkspaces.map((w) => (
            <div key={w.id} className="menu-ws-row">
              <button
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
              {canDelete(w) && (
                <button
                  type="button"
                  className="menu-ws-del"
                  disabled={pending}
                  aria-label={`Delete ${w.name}`}
                  title="Delete workspace"
                  onClick={() => askDelete(w)}
                >
                  <Icon name="trash" size={15} strokeWidth={1.8} />
                </button>
              )}
            </div>
          ))}
          {suspendedWorkspaces.length > 0 && (
            <>
              <div className="menu-head">Deactivated</div>
              {suspendedWorkspaces.map((w) => (
                <div key={w.id} className="menu-ws-row">
                  <button
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    disabled={pending}
                    onClick={() => reactivate(w.id)}
                    title="Reactivate this workspace"
                  >
                    <span className="merchant-logo sm">{w.initials}</span>
                    <span className="grow t-muted">{w.name}</span>
                    <span className="reactivate-tag">Reactivate</span>
                  </button>
                  {canDelete(w) && (
                    <button
                      type="button"
                      className="menu-ws-del"
                      disabled={pending}
                      aria-label={`Delete ${w.name}`}
                      title="Delete workspace"
                      onClick={() => askDelete(w)}
                    >
                      <Icon name="trash" size={15} strokeWidth={1.8} />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
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
            {NAV_ITEMS.filter(
              (i) => i.group === group.id && (analyticsEnabled || i.key !== 'analytics'),
            ).map((item) => {
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
