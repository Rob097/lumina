'use client';

import { useState, useTransition } from 'react';
import type { ApiKeySummary, KeyEnv, KeyKind } from '@lumina/shared';
import { shortDate } from '@/lib/format';
import { CopyButton } from '@/components/ui/CopyButton';
import { createKeyAction, listKeysAction, revokeKeyAction } from './actions';

export function KeysSection({ initial }: { initial: ApiKeySummary[] }) {
  const [keys, setKeys] = useState<ApiKeySummary[]>(initial);
  const [kind, setKind] = useState<KeyKind>('publishable');
  const [env, setEnv] = useState<KeyEnv>('test');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh() {
    listKeysAction().then(setKeys);
  }

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await createKeyAction({ kind, env });
      if (res.ok) {
        setRevealed(res.data.key);
        refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      const res = await revokeKeyAction(id);
      if (res.ok) refresh();
      else setError(res.error);
    });
  }

  const active = keys.filter((k) => !k.revokedAt);

  return (
    <section className="card settings-section">
      <div className="card-head">
        <h3>API keys</h3>
      </div>
      <div className="card-pad">
        <p className="settings-p t-secondary">
          Publishable keys (<span className="code-inline">pk_</span>) go in the widget snippet; secret keys
          (<span className="code-inline">sk_</span>) are server-only. The full value is shown once.
        </p>

        <div className="key-create">
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as KeyKind)}>
            <option value="publishable">Publishable</option>
            <option value="secret">Secret</option>
          </select>
          <select className="select" value={env} onChange={(e) => setEnv(e.target.value as KeyEnv)}>
            <option value="test">Test</option>
            <option value="live">Live</option>
          </select>
          <button className="btn btn-primary btn-sm" type="button" disabled={pending} onClick={create}>
            {pending ? 'Creating…' : 'Create key'}
          </button>
        </div>

        {error && <p className="field-error">{error}</p>}

        {active.length > 0 ? (
          <table className="table key-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Type</th>
                <th>Env</th>
                <th>Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.map((k) => (
                <tr key={k.id}>
                  <td className="mono text-sm">{k.prefix}…</td>
                  <td>
                    <span className="badge">{k.kind === 'secret' ? 'Secret' : 'Publishable'}</span>
                  </td>
                  <td>
                    <span className={`badge ${k.env === 'live' ? 'badge-live' : 'badge-test'}`}>
                      <span className="dot" />
                      {k.env === 'live' ? 'Live' : 'Test'}
                    </span>
                  </td>
                  <td className="t-muted text-sm">
                    {k.lastUsedAt ? shortDate(new Date(k.lastUsedAt)) : 'Never'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm danger" type="button" onClick={() => revoke(k.id)}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="t-muted settings-empty">No active keys yet.</p>
        )}
      </div>

      {revealed && (
        <div className="drawer-scrim" onClick={() => setRevealed(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header className="drawer-head">
              <h3>Copy your new key</h3>
            </header>
            <div className="drawer-body">
              <p className="t-secondary settings-p">
                This is the only time the full key is shown. Store it somewhere safe — you can&apos;t view it
                again.
              </p>
              <div className="code-block">
                <CopyButton value={revealed} className="code-copy" />
                <code>{revealed}</code>
              </div>
            </div>
            <footer className="drawer-foot">
              <button className="btn btn-primary" type="button" onClick={() => setRevealed(null)}>
                Done
              </button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
