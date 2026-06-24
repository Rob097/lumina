import type { Locale, ResultCta, Theme, WidgetGuide } from '@lumina/shared';

/** Public types for `@lumina/widget/preview` (built by tsup.preview.config.ts). */

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
  onViewChange?: (view: PreviewView) => void;
}

/** Render (or re-render) the real widget UI into `container`. Returns a disposer. */
export function mountWidgetPreview(container: HTMLElement, opts: PreviewOptions): () => void;
