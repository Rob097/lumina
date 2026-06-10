'use client';

import { useEnv } from '@/lib/providers';
import { buildInstallSnippet, buildTriggerSnippet } from '@/lib/widget';
import { CopyButton } from '@/components/ui/CopyButton';

export interface PubKey {
  env: 'live' | 'test';
  prefix: string;
  /** The full publishable key (it's public); null for legacy keys created before we stored it. */
  siteKey: string | null;
}

/**
 * Install walkthrough: the loader `<script>` + a trigger button, scoped to the active Test/Live env.
 * A publishable key is the public `site_key`, so when we have its full value we bake it straight into
 * the snippet — the merchant copies and pastes with nothing to fill in. Legacy keys (no stored value)
 * fall back to the prefix placeholder with a note to roll a fresh key.
 */
export function InstallGuide({ pubKeys, cdnUrl }: { pubKeys: PubKey[]; cdnUrl: string }) {
  const { env } = useEnv();
  const key = pubKeys.find((k) => k.env === env);
  const siteKey = key?.siteKey ?? (key ? `${key.prefix}…` : `pk_${env}_…`);

  const script = buildInstallSnippet({ cdnUrl, siteKey });
  const trigger = buildTriggerSnippet({ buttonText: 'Try in your room', productId: 'YOUR_PRODUCT_ID' });

  return (
    <div className="install-guide">
      <div className="install-head">
        <p className="t-secondary">
          Add LUMINA to your storefront in two snippets. You're viewing the{' '}
          <strong>{env === 'live' ? 'Live' : 'Test'}</strong> environment — switch it from the top bar.
        </p>
        <span className={`badge ${env === 'live' ? 'badge-live' : 'badge-test'}`}>
          <span className="dot" />
          {env === 'live' ? 'Live key' : 'Test key'}
        </span>
      </div>

      {/* Step 1 — script */}
      <div className="card">
        <div className="card-head">
          <h3>
            <span className="step-no">1</span> Add the script
          </h3>
        </div>
        <div className="card-pad">
          <p className="t-secondary install-p">
            Paste this once into your storefront&apos;s <span className="code-inline">&lt;head&gt;</span>. It
            loads asynchronously and ships under 45&nbsp;KB.
          </p>
          <div className="code-block">
            <CopyButton value={script} className="code-copy" />
            <code>{script}</code>
          </div>
          {key?.siteKey ? (
            <p className="install-note">
              This snippet already includes your {env} publishable key — copy it and paste as-is. It&apos;s a
              public key (the widget exposes it by design); manage it in <a href="/settings">Settings</a>.
            </p>
          ) : key ? (
            <p className="install-note">
              Your {env} publishable key starts with{' '}
              <span className="code-inline">{key.prefix}</span>. Paste the full value you copied when you
              created it — lost it? Roll a new key in <a href="/settings">Settings</a>.
            </p>
          ) : (
            <p className="install-note">
              No {env} publishable key yet — create one in <a href="/settings">Settings → API keys</a>,
              then paste it as <span className="code-inline">data-site-key</span>.
            </p>
          )}
        </div>
      </div>

      {/* Step 2 — trigger */}
      <div className="card">
        <div className="card-head">
          <h3>
            <span className="step-no">2</span> Add a trigger button
          </h3>
        </div>
        <div className="card-pad">
          <p className="t-secondary install-p">
            Drop a button on each product page. Set <span className="code-inline">data-lumina-product</span>{' '}
            to that product&apos;s ID — the widget opens scoped to it.
          </p>
          <div className="code-block">
            <CopyButton value={trigger} className="code-copy" />
            <code style={{ whiteSpace: 'pre' }}>{trigger}</code>
          </div>
          <p className="install-note">
            Prefer code? Call <span className="code-inline">window.Lumina.open(&#123; productId &#125;)</span>{' '}
            from your own handler instead.
          </p>
        </div>
      </div>

      {/* Step 3 — verify */}
      <div className="card">
        <div className="card-head">
          <h3>
            <span className="step-no">3</span> Verify it&apos;s live
          </h3>
        </div>
        <div className="card-pad">
          <ul className="install-checks">
            <li>Open a product page and click your new button — the modal should appear.</li>
            <li>
              Make sure your storefront domain is allow-listed in{' '}
              <a href="/settings">Settings → Domains</a>, or requests are blocked.
            </li>
            <li>
              Watch live runs land under <a href="/generations">Generations</a> and metrics on{' '}
              <a href="/overview">Overview</a>.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
