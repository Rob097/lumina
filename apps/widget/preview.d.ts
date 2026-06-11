import type { Locale, ResultCta, Theme } from '@lumina/shared';

/** Public types for `@lumina/widget/preview` (built by tsup.preview.config.ts). */

export type PreviewView = 'button' | 'modal' | 'result';

export interface PreviewSettings {
  theme: Theme;
  buttonText: string;
  locale: Locale;
  i18n: Record<string, string>;
  watermark: boolean;
  resultCta: ResultCta | null;
}

export interface PreviewOptions {
  view: PreviewView;
  settings: PreviewSettings;
  onViewChange?: (view: PreviewView) => void;
}

/** Render (or re-render) the real widget UI into `container`. Returns a disposer. */
export function mountWidgetPreview(container: HTMLElement, opts: PreviewOptions): () => void;
