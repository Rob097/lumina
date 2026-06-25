'use client';

import { useState, useTransition } from 'react';
import type { ApiKeySummary } from '@lumina/shared';
import { shortDate } from '@/lib/format';
import { CopyButton } from '@/components/ui/CopyButton';
import { listKeysAction, regenerateKeysAction } from './actions';

export function KeysSection({ initial }: { initial: ApiKeySummary[] }) {
  const [keys, setKeys] = useState<ApiKeySummary[]>(initial);
  const [revealed, setRevealed] = useState<{ publishable: string; secret: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // We only ever surface the live pair — test keys just added noise.
  const live = keys.filter((k) => !k.revokedAt && k.env === 'live');
  const publishable = live.find((k) => k.kind === 'publishable') ?? null;
  const secret = live.find((k) => k.kind === 'secret') ?? null;
  const hasKeys = Boolean(publishable || secret);

  function regenerate() {
    setError(null);
    setConfirming(false);
    startTransition(async () => {
      const res = await regenerateKeysAction();
      if (res.ok) {
        setRevealed(res.data);
        listKeysAction().then(setKeys);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section className="card settings-section">
      <div className="card-head">
        <h3>API keys</h3>
      </div>
      <div className="card-pad">
        <p className="settings-p t-secondary">
          Your <span className="code-inline">pk_live</span> publishable key is the public site key in the
          widget snippet; the <span className="code-inline">sk_live</span> secret key is server-only.
          Regenerating issues a fresh pair and immediately retires the current one.
        </p>

        {hasKeys ? (
          <div className="key-rows">
            {publishable && (
              <div className="key-row">
                <span className="badge">Publishable</span>
                <code className="mono text-sm key-value">
                  {publishable.siteKey ?? `${publishable.prefix}…`}
                </code>
                <span className="t-muted text-sm">
                  {publishable.lastUsedAt
                    ? `used ${shortDate(new Date(publishable.lastUsedAt))}`
                    : 'never used'}
                </span>
              </div>
            )}
            {secret && (
              <div className="key-row">
                <span className="badge">Secret</span>
                <code className="mono text-sm key-value">{secret.prefix}…</code>
                <span className="t-muted text-sm">
                  {secret.lastUsedAt ? `used ${shortDate(new Date(secret.lastUsedAt))}` : 'never used'}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="t-muted settings-empty">
            No live keys yet — generate a pair to install the widget.
          </p>
        )}

        {error && <p className="field-error">{error}</p>}

        <div className="key-actions">
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            disabled={pending}
            onClick={() => setConfirming(true)}
          >
            {pending ? 'Regenerating…' : hasKeys ? 'Regenerate keys' : 'Generate keys'}
          </button>
        </div>
      </div>

      {confirming && (
        <div className="drawer-scrim" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header className="drawer-head">
              <h3>Regenerate API keys?</h3>
            </header>
            <div className="drawer-body">
              <p className="t-secondary settings-p">
                This issues a brand-new publishable + secret key and <strong>immediately revokes the
                current ones</strong>. Your live widget snippet uses the publishable key as its site key,
                so you&apos;ll need to update the snippet on your site (Script &amp; install) for the widget
                to keep working.
              </p>
            </div>
            <footer className="drawer-foot">
              <button className="btn btn-ghost" type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={regenerate}>
                Regenerate
              </button>
            </footer>
          </div>
        </div>
      )}

      {revealed && (
        <div className="drawer-scrim" onClick={() => setRevealed(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header className="drawer-head">
              <h3>Copy your new keys</h3>
            </header>
            <div className="drawer-body">
              <p className="t-secondary settings-p">
                This is the only time the secret key is shown — store it somewhere safe. Update your widget
                snippet with the new publishable key.
              </p>
              <div className="field">
                <span className="field-label">Publishable (site key)</span>
                <div className="code-block">
                  <CopyButton value={revealed.publishable} className="code-copy" />
                  <code>{revealed.publishable}</code>
                </div>
              </div>
              <div className="field">
                <span className="field-label">Secret</span>
                <div className="code-block">
                  <CopyButton value={revealed.secret} className="code-copy" />
                  <code>{revealed.secret}</code>
                </div>
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
