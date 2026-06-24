import { render, type VNode } from 'preact';
import type { Locale, ResultCta, Theme, WidgetGuide, WidgetLimits } from '@lumina/shared';
import { GuideStep } from './ui/steps/GuideStep.js';
import { UploadStep } from './ui/steps/UploadStep.js';
import { ResultStep } from './ui/steps/ResultStep.js';
import { themeVars } from './ui/theme.js';
import { createTranslator } from './core/i18n.js';
import { LAUNCHER_BUTTON_CSS, LAUNCHER_ICON } from './core/launcher.js';
import widgetStyles from './ui/styles.css?inline';

/**
 * Dashboard live-preview mount (D51 follow-up). Renders the **real** widget UI — the same step
 * components shipped to storefronts — into a Shadow root, themed from the merchant's (unsaved) settings.
 * Because it IS the widget, the preview can't drift from production. Self-contained: bundles its own
 * preact and reuses the widget stylesheet, so the React dashboard just calls `mountWidgetPreview`.
 */

export type PreviewView = 'button' | 'guide' | 'modal' | 'result';

export interface PreviewSettings {
  theme: Theme;
  buttonText: string;
  locale: Locale;
  i18n: Record<string, string>;
  watermark: boolean;
  resultCta: ResultCta | null;
  /** Pre-upload guide; the dashboard only offers the 'guide' view when this is set + enabled. */
  guide?: WidgetGuide | null;
}

export interface PreviewOptions {
  view: PreviewView;
  settings: PreviewSettings;
  /** Fired when the shopper clicks the launcher in the preview (lets the dashboard advance the tab). */
  onViewChange?: (view: PreviewView) => void;
}

const PREVIEW_LIMITS: WidgetLimits = {
  anonDailyCap: 5,
  maxUploadBytes: 10 * 1024 * 1024,
  maxImageEdgePx: 2048,
};

const PREVIEW_CSS = `
.lp-stage{display:flex;align-items:center;justify-content:center;min-height:340px;padding:10px}
.lp-stage-button{min-height:180px}
.lp-modal{width:100%;box-shadow:0 12px 40px rgba(0,0,0,.16)}
`;

function svg(inner: string): string {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='500'>${inner}</svg>`,
  )}`;
}
const PREVIEW_BEFORE = svg(
  "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='rgb(52,56,63)'/><stop offset='1' stop-color='rgb(21,24,29)'/></linearGradient></defs><rect width='800' height='500' fill='url(%23g)'/>",
);
const PREVIEW_AFTER = svg(
  "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='rgb(29,58,107)'/><stop offset='1' stop-color='rgb(15,98,254)'/></linearGradient></defs><rect width='800' height='500' fill='url(%23g)'/><rect x='520' y='250' width='180' height='190' rx='10' fill='rgba(255,255,255,.85)'/>",
);

const noop = (): void => {};

function viewVNode(opts: PreviewOptions, t: ReturnType<typeof createTranslator>): VNode {
  const { view, settings } = opts;

  if (view === 'button') {
    return (
      <div class="lp-stage lp-stage-button">
        <button class="lumina-launcher" type="button" onClick={() => opts.onViewChange?.('modal')}>
          <span dangerouslySetInnerHTML={{ __html: LAUNCHER_ICON }} />
          <span>{settings.buttonText}</span>
        </button>
      </div>
    );
  }

  const body =
    view === 'result' ? (
      <ResultStep
        t={t}
        beforeUrl={PREVIEW_BEFORE}
        resultUrl={PREVIEW_AFTER}
        resultCta={settings.resultCta}
        onSave={noop}
        onShare={noop}
        onRegenerate={noop}
        onFeedback={noop}
        onCta={noop}
      />
    ) : view === 'guide' && settings.guide ? (
      <GuideStep t={t} guide={settings.guide} onContinue={noop} />
    ) : (
      <UploadStep t={t} limits={PREVIEW_LIMITS} onSelectRoom={noop} />
    );

  return (
    <div class="lp-stage">
      <div class={`lumina-modal lp-modal${view === 'result' ? ' lumina-modal-wide' : ''}`}>
        <button class="lumina-close" type="button" aria-label={t('close')}>
          ×
        </button>
        <div class="lumina-body">{body}</div>
        {settings.watermark ? <div class="lumina-powered">{t('poweredBy')}</div> : null}
      </div>
    </div>
  );
}

const MOUNTS = new WeakMap<HTMLElement, { root: ShadowRoot; stage: HTMLElement }>();

/** Render (or re-render) the live preview into `container`. Returns a disposer. */
export function mountWidgetPreview(container: HTMLElement, opts: PreviewOptions): () => void {
  let entry = MOUNTS.get(container);
  if (!entry) {
    const root = container.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `${widgetStyles}\n${LAUNCHER_BUTTON_CSS}\n${PREVIEW_CSS}`;
    root.appendChild(style);
    const stage = document.createElement('div');
    stage.setAttribute('data-lumina-container', '');
    root.appendChild(stage);
    entry = { root, stage };
    MOUNTS.set(container, entry);
  }

  for (const [key, value] of Object.entries(themeVars(opts.settings.theme))) {
    entry.stage.style.setProperty(key, value);
  }
  const t = createTranslator(opts.settings.locale, opts.settings.i18n);
  render(viewVNode(opts, t), entry.stage);

  const { stage } = entry;
  return () => render(null, stage);
}
