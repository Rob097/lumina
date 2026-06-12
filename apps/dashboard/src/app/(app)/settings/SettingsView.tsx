'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  PLAN_CATALOG,
  type ApiKeySummary,
  type NotificationPrefs,
  type PlanTier,
  type TeamMember,
} from '@lumina/shared';
import { shortDate } from '@/lib/format';
import { KeysSection } from './KeysSection';
import { DomainsSection } from './DomainsSection';
import { NotificationPrefsSection } from './NotificationPrefsSection';
import { deleteAccountAction, renameMerchantAction } from './actions';

function AccountSection({
  name,
  slug,
  email,
  plan,
}: {
  name: string;
  slug: string;
  email: string;
  plan: PlanTier;
}) {
  const [value, setValue] = useState(name);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = value.trim() !== name && value.trim().length > 0;

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await renameMerchantAction(value.trim());
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  }

  return (
    <section className="card settings-section">
      <div className="card-head">
        <h3>Account</h3>
      </div>
      <div className="card-pad settings-account">
        <label className="field">
          <span className="field-label">Store name</span>
          <div className="inline-edit">
            <input
              className="input"
              value={value}
              maxLength={80}
              onChange={(e) => {
                setValue(e.target.value);
                setSaved(false);
              }}
            />
            <button className="btn btn-secondary btn-sm" type="button" disabled={!dirty || pending} onClick={save}>
              {pending ? 'Saving…' : saved && !dirty ? 'Saved' : 'Save'}
            </button>
          </div>
        </label>
        {error && <p className="field-error">{error}</p>}
        <div className="settings-readonly">
          <div>
            <span className="field-label">Workspace</span>
            <span className="ro-value mono">{slug}</span>
          </div>
          <div>
            <span className="field-label">Signed in as</span>
            <span className="ro-value">{email}</span>
          </div>
          <div>
            <span className="field-label">Plan</span>
            <span className="ro-value">
              {PLAN_CATALOG[plan].label} · <Link href="/billing">Manage</Link>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamSection({ members }: { members: TeamMember[] }) {
  return (
    <section className="card settings-section">
      <div className="card-head">
        <h3>Team</h3>
        <span className="badge badge-neutral" title="Invites are coming soon">
          Invites coming soon
        </span>
      </div>
      <div className="card-pad">
        {members.length > 0 ? (
          <ul className="team-list">
            {members.map((m) => (
              <li key={m.userId}>
                <span className="team-email">{m.email ?? m.userId}</span>
                <span className="team-meta">
                  <span className={`badge ${m.role === 'owner' ? 'badge-accent' : ''}`}>{m.role}</span>
                  <span className="t-muted text-sm">joined {shortDate(new Date(m.joinedAt))}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-muted settings-empty">No team members found.</p>
        )}
      </div>
    </section>
  );
}

function DangerZone({ merchantName }: { merchantName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const matches = typed.trim() === merchantName;

  function confirmDelete() {
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAccountAction();
      if (res.ok) {
        window.location.href = '/login';
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section className="card settings-section danger-card">
      <div className="card-head">
        <h3>Danger zone</h3>
      </div>
      <div className="card-pad danger-rows">
        <div className="danger-row">
          <div>
            <div className="danger-title">Cancel subscription</div>
            <div className="t-muted text-sm">Downgrade to Free at the end of the current period.</div>
          </div>
          <Link className="btn btn-secondary btn-sm" href="/billing">
            Manage billing
          </Link>
        </div>
        <div className="danger-row">
          <div>
            <div className="danger-title">Delete account &amp; data</div>
            <div className="t-muted text-sm">
              Permanently erase this workspace, products, and generations. This cannot be undone.
            </div>
          </div>
          <button className="btn btn-danger btn-sm" type="button" onClick={() => setConfirming(true)}>
            Delete…
          </button>
        </div>
      </div>

      {confirming && (
        <div className="drawer-scrim" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header className="drawer-head">
              <h3>Delete this workspace?</h3>
            </header>
            <div className="drawer-body">
              <p className="t-secondary settings-p">
                This is irreversible. Type the store name <strong>{merchantName}</strong> to request erasure.
              </p>
              <input
                className="input"
                placeholder={merchantName}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
              {error && <p className="field-error">{error}</p>}
            </div>
            <footer className="drawer-foot">
              <button className="btn btn-ghost" type="button" onClick={() => setConfirming(false)} disabled={pending}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={!matches || pending}
                onClick={confirmDelete}
              >
                {pending ? 'Deleting…' : 'Delete forever'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

export function SettingsView({
  merchantName,
  slug,
  email,
  plan,
  keys,
  domains,
  team,
  notificationPrefs,
}: {
  merchantName: string;
  slug: string;
  email: string;
  plan: PlanTier;
  keys: ApiKeySummary[];
  domains: string[];
  team: TeamMember[];
  notificationPrefs: NotificationPrefs;
}) {
  return (
    <div className="settings">
      <AccountSection name={merchantName} slug={slug} email={email} plan={plan} />
      <KeysSection initial={keys} />
      <DomainsSection initial={domains} />
      <NotificationPrefsSection initial={notificationPrefs} />
      <TeamSection members={team} />
      <DangerZone merchantName={merchantName} />
    </div>
  );
}
