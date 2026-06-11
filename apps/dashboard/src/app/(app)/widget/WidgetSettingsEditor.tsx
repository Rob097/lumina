'use client';

import { useMemo, useState, useTransition } from 'react';
import { LOCALES, type Locale, type WidgetSettings } from '@lumina/shared';
import { useEnv } from '@/lib/providers';
import { CTA_PLATFORMS, type CtaPreset } from '@/lib/platforms';
import { BrandIcon } from '@/components/ui/BrandIcon';
import { WidgetPreview } from './WidgetPreview';
import { saveWidgetSettingsAction } from './actions';

const SWATCHES = ['#0f62fe', '#111317', '#0b7d83', '#6a5be2', '#c2410c', '#be185d'];

const FONTS: { value: string; label: string }[] = [
  { value: 'var(--font-ui)', label: 'Geist (LUMINA default)' },
  { value: 'Georgia, serif', label: 'Inherit · Serif host' },
  { value: 'ui-monospace, monospace', label: 'Monospace' },
];

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English (US)',
  it: 'Italiano',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
};

/**
 * Widget string keys a merchant may safely override — each maps to a real widget label (§3.7). The
 * `placeholder` is the shipped default copy, shown so the merchant sees what they'd be replacing.
 */
const OVERRIDE_KEYS: { key: string; label: string; placeholder: string }[] = [
  { key: 'upload.title', label: 'Upload title', placeholder: 'Add a photo of your room' },
  { key: 'upload.hint', label: 'Upload hint', placeholder: 'JPG, PNG or WebP · up to {max}' },
  { key: 'confirm.generate', label: 'Generate button', placeholder: 'Generate preview' },
  { key: 'result.title', label: 'Result title', placeholder: "Here's your room" },
];

export function WidgetSettingsEditor({ initial }: { initial: WidgetSettings }) {
  const { env } = useEnv();
  const [baseline, setBaseline] = useState(initial);
  const [s, setS] = useState<WidgetSettings>(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = useMemo(() => JSON.stringify(s) !== JSON.stringify(baseline), [s, baseline]);

  const patch = (p: Partial<WidgetSettings>) => setS((prev) => ({ ...prev, ...p }));
  const patchTheme = (p: Partial<WidgetSettings['theme']>) =>
    setS((prev) => ({ ...prev, theme: { ...prev.theme, ...p } }));

  function setOverride(key: string, value: string) {
    setS((prev) => {
      const i18n = { ...prev.i18n };
      if (value.trim()) i18n[key] = value;
      else delete i18n[key];
      return { ...prev, i18n };
    });
  }

  function setCta(field: 'label' | 'urlTemplate', value: string) {
    setS((prev) => {
      const cta = prev.resultCta ?? { label: '', urlTemplate: '' };
      const next = { ...cta, [field]: value };
      const empty = !next.label.trim() && !next.urlTemplate.trim();
      return { ...prev, resultCta: empty ? null : next };
    });
  }

  /** Quick-fill both CTA fields with a platform's typical values; the merchant can still edit them. */
  function applyCtaPreset(cta: CtaPreset) {
    setS((prev) => ({ ...prev, resultCta: { ...cta } }));
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveWidgetSettingsAction(s);
      if (res.ok) {
        setBaseline(res.settings);
        setS(res.settings);
        setSavedAt(Date.now());
      } else {
        setError(res.error);
      }
    });
  }

  const radius = s.theme.radius ?? 16;
  const mode = s.theme.mode ?? 'auto';
  const accent = s.theme.accent ?? '#0f62fe';

  return (
    <>
      <div className="settings-actions">
        <div className="grow">
          {error ? (
            <span className="dirty-note" style={{ color: 'var(--danger)' }}>
              {error}
            </span>
          ) : dirty ? (
            <span className="dirty-note">Unsaved changes</span>
          ) : savedAt ? (
            <span className="dirty-note">All changes saved</span>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!dirty || pending}
          onClick={() => {
            setS(baseline);
            setError(null);
          }}
        >
          Discard
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!dirty || pending}
          onClick={save}
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <div className="settings-layout">
        <div className="settings-col">
          {/* Trigger button */}
          <div className="card set-card">
            <div className="card-head">
              <h3>Trigger button</h3>
            </div>
            <div className="card-pad" style={{ paddingTop: '6px' }}>
              <div className="set-row">
                <div className="set-label">
                  Button text
                  <div className="sub">Shown on the storefront launcher.</div>
                </div>
                <div className="set-control">
                  <input
                    className="input"
                    maxLength={32}
                    value={s.buttonText}
                    onChange={(e) => patch({ buttonText: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Theme */}
          <div className="card set-card">
            <div className="card-head">
              <h3>Theme</h3>
              <span className="badge badge-accent">Live preview →</span>
            </div>
            <div className="card-pad" style={{ paddingTop: '6px' }}>
              <div className="set-row">
                <div className="set-label">
                  Accent color
                  <div className="sub">Drives buttons, links &amp; the result CTA.</div>
                </div>
                <div className="set-control">
                  <div className="swatch-pick">
                    {SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        style={{ background: c }}
                        aria-pressed={accent.toLowerCase() === c}
                        onClick={() => patchTheme({ accent: c })}
                      />
                    ))}
                    <label className="custom" title="Custom hex">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      <input
                        type="color"
                        value={accent}
                        onChange={(e) => patchTheme({ accent: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </div>
              <div className="set-row">
                <div className="set-label">
                  Appearance
                  <div className="sub">Auto follows the visitor's system.</div>
                </div>
                <div className="set-control">
                  <div className="segmented">
                    {(['light', 'dark', 'auto'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        aria-selected={mode === m}
                        onClick={() => patchTheme({ mode: m })}
                      >
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="set-row">
                <div className="set-label">Corner radius</div>
                <div className="set-control">
                  <div className="radius-pick">
                    <input
                      type="range"
                      min={0}
                      max={24}
                      value={radius}
                      onChange={(e) => patchTheme({ radius: Number(e.target.value) })}
                    />
                    <span className="rv">{radius}px</span>
                  </div>
                </div>
              </div>
              <div className="set-row">
                <div className="set-label">
                  Font family
                  <div className="sub">Default inherits the host site's font.</div>
                </div>
                <div className="set-control">
                  <select
                    className="select"
                    value={s.theme.fontFamily ?? 'var(--font-ui)'}
                    onChange={(e) => patchTheme({ fontFamily: e.target.value })}
                  >
                    {FONTS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Locale & copy */}
          <div className="card set-card">
            <div className="card-head">
              <h3>Locale &amp; copy</h3>
            </div>
            <div className="card-pad" style={{ paddingTop: '6px' }}>
              <div className="set-row">
                <div className="set-label">
                  Default locale
                  <div className="sub">Auto-detected from &lt;html lang&gt;.</div>
                </div>
                <div className="set-control">
                  <select
                    className="select"
                    value={s.locale}
                    onChange={(e) => patch({ locale: e.target.value as Locale })}
                  >
                    {LOCALES.map((l) => (
                      <option key={l} value={l}>
                        {LOCALE_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="set-row">
                <div className="set-label">
                  String overrides
                  <div className="sub">Override any widget label.</div>
                </div>
                <div className="set-control">
                  <div className="locale-override">
                    {OVERRIDE_KEYS.map(({ key, label, placeholder }) => (
                      <div className="ovr" key={key}>
                        <span className="k">{label}</span>
                        <input
                          className="input"
                          aria-label={label}
                          placeholder={placeholder}
                          value={s.i18n[key] ?? ''}
                          onChange={(e) => setOverride(key, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Result CTA */}
          <div className="card set-card">
            <div className="card-head">
              <h3>Result CTA</h3>
            </div>
            <div className="card-pad" style={{ paddingTop: '6px' }}>
              <div className="cta-presets">
                <span className="cta-presets-label">Quick fill for…</span>
                <div className="cta-presets-row">
                  {CTA_PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="cta-preset"
                      title={`Use ${p.name} defaults`}
                      onClick={() => applyCtaPreset(p.cta)}
                    >
                      <BrandIcon name={p.brandIcon} size={18} />
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="set-row">
                <div className="set-label">
                  CTA label
                  <div className="sub">Emits cta:click on tap.</div>
                </div>
                <div className="set-control">
                  <input
                    className="input"
                    maxLength={24}
                    placeholder="Add to cart"
                    value={s.resultCta?.label ?? ''}
                    onChange={(e) => setCta('label', e.target.value)}
                  />
                </div>
              </div>
              <div className="set-row">
                <div className="set-label">Link template</div>
                <div className="set-control">
                  <input
                    className="input mono text-sm"
                    placeholder="/cart/add?id={productId}"
                    value={s.resultCta?.urlTemplate ?? ''}
                    onChange={(e) => setCta('urlTemplate', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="card set-card">
            <div className="card-head">
              <h3>Branding</h3>
            </div>
            <div className="card-pad" style={{ paddingTop: '6px' }}>
              <div className="set-row">
                <div className="set-label">
                  Show "Powered by LUMINA"
                  <div className="sub">Removable on Growth &amp; above.</div>
                </div>
                <div className="set-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={s.watermark}
                      onChange={(e) => patch({ watermark: e.target.checked })}
                    />
                    <span className="track" />
                    <span className="thumb" />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <WidgetPreview settings={s} env={env} />
      </div>
    </>
  );
}
