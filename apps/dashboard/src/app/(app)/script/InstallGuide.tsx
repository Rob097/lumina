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
 * Install walkthrough: the loader `<script>` + a trigger button. A publishable key is the public
 * `site_key`, so when we have its full value we bake it straight into the snippet — the merchant copies
 * and pastes with nothing to fill in. Legacy keys (no stored value) fall back to the prefix placeholder.
 */
export function InstallGuide({
  pubKeys,
  cdnUrl,
  onBack,
}: {
  pubKeys: PubKey[];
  cdnUrl: string;
  onBack?: () => void;
}) {
  const { env } = useEnv();
  const key = pubKeys.find((k) => k.env === env);
  const siteKey = key?.siteKey ?? (key ? `${key.prefix}…` : `pk_${env}_…`);

  const script = buildInstallSnippet({ cdnUrl, siteKey });
  const trigger = buildTriggerSnippet({ productId: 'YOUR_PRODUCT_ID' });

  return (
    <div className="install-guide install-guide-wide">
      <div className="install-top">
        {onBack ? (
          <button type="button" className="install-back" onClick={onBack}>
            ← All platforms
          </button>
        ) : (
          <span />
        )}
        <div className="install-keytag">
          <span className={`badge ${env === 'live' ? 'badge-live' : 'badge-test'}`}>
            <span className="dot" />
            {env === 'live' ? 'Live' : 'Test'}
          </span>
          {key ? <span className="install-keypill">{key.siteKey ?? `${key.prefix}…`}</span> : null}
        </div>
      </div>

      <div className="install-hero">
        <h2>Install on any website</h2>
        <p>Three steps. Copy, paste, verify.</p>
      </div>

      {/* Step 1 — script */}
      <div className="install-step">
        <div className="install-step-head">
          <span className="step-no">1</span>
          <h3>Add the script</h3>
        </div>
        <p className="install-step-desc">
          Paste this once just before <span className="code-inline">&lt;/head&gt;</span>. It loads
          asynchronously and ships under 45&nbsp;KB — your publishable key is public by design.
        </p>
        <div className="code-block install-step-code">
          <CopyButton value={script} className="code-copy" />
          <code>{script}</code>
        </div>
        {key?.siteKey ? (
          <p className="install-note">
            This snippet already includes your {env} publishable key — copy it and paste as-is. Manage
            it in <a href="/settings">Settings</a>.
          </p>
        ) : key ? (
          <p className="install-note">
            Your {env} publishable key starts with <span className="code-inline">{key.prefix}</span>.
            Paste the full value you copied when you created it — lost it? Roll a new key in{' '}
            <a href="/settings">Settings</a>.
          </p>
        ) : (
          <p className="install-note">
            No {env} publishable key yet — create one in <a href="/settings">Settings → API keys</a>,
            then paste it as <span className="code-inline">data-site-key</span>.
          </p>
        )}
      </div>

      {/* Step 2 — launcher placeholder */}
      <div className="install-step">
        <div className="install-step-head">
          <span className="step-no">2</span>
          <h3>Place the button</h3>
        </div>
        <p className="install-step-desc">
          Drop this where you want the launcher — YuzuView renders its styled button into it. Set{' '}
          <span className="code-inline">data-lumina-product</span> to the product&apos;s ID, or call{' '}
          <span className="code-inline">window.Lumina.open(&#123; productId &#125;)</span> from your own
          button.
        </p>
        <div className="code-block install-step-code">
          <CopyButton value={trigger} className="code-copy" />
          <code style={{ whiteSpace: 'pre' }}>{trigger}</code>
        </div>
      </div>

      {/* Step 3 — verify */}
      <div className="install-step">
        <div className="install-step-head">
          <span className="step-no">3</span>
          <h3>Verify it&apos;s live</h3>
        </div>
        <ul className="install-checks">
          <li>Open a product page and click your new button — the modal should appear.</li>
          <li>
            Allow-list your storefront domain in <a href="/settings">Settings → Domains</a>, or
            requests are blocked.
          </li>
          <li>
            Watch live runs land under <a href="/generations">Generations</a> and metrics on{' '}
            <a href="/overview">Overview</a>.
          </li>
        </ul>
      </div>
    </div>
  );
}
