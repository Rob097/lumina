'use client';

import { useState, useTransition } from 'react';
import { HostnameSchema } from '@lumina/shared';
import { saveDomainsAction } from './actions';

export function DomainsSection({ initial }: { initial: string[] }) {
  const [domains, setDomains] = useState<string[]>(initial);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function persist(next: string[]) {
    setError(null);
    startTransition(async () => {
      const res = await saveDomainsAction(next);
      if (res.ok) setDomains(res.data);
      else setError(res.error);
    });
  }

  function add() {
    const host = value.trim().toLowerCase();
    if (!host) return;
    if (!HostnameSchema.safeParse(host).success) {
      setError(`"${host}" is not a valid hostname (no scheme or path).`);
      return;
    }
    if (domains.includes(host)) {
      setError('That domain is already allow-listed.');
      return;
    }
    setValue('');
    persist([...domains, host]);
  }

  function remove(host: string) {
    persist(domains.filter((d) => d !== host));
  }

  return (
    <section className="card settings-section">
      <div className="card-head">
        <h3>Allowed domains</h3>
      </div>
      <div className="card-pad">
        <p className="settings-p t-secondary">
          The widget only runs on these storefront domains. Use <span className="code-inline">*.</span> for
          subdomains (e.g. <span className="code-inline">*.myshop.com</span>).
        </p>

        <div className="domain-add">
          <input
            className="input"
            placeholder="shop.example.com"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn btn-secondary btn-sm" type="button" disabled={pending} onClick={add}>
            Add
          </button>
        </div>

        {error && <p className="field-error">{error}</p>}

        {domains.length > 0 ? (
          <ul className="domain-list">
            {domains.map((d) => (
              <li key={d}>
                <span className="mono text-sm">{d}</span>
                <button className="icon-btn" type="button" onClick={() => remove(d)} aria-label={`Remove ${d}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-muted settings-empty">
            No domains yet — the widget is blocked until you add one.
          </p>
        )}
      </div>
    </section>
  );
}
