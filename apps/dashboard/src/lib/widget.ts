import type { ThemeMode, WidgetSettings } from '@lumina/shared';

/** LUMINA defaults mirrored from the design tokens — used when a theme field is unset. */
const DEFAULT_ACCENT = '#0f62fe';
const DEFAULT_RADIUS = 16;
const DEFAULT_FONT = 'var(--font-ui)';

/** Expand a `#rrggbb` hex into an `rgba()` string (the live-preview accent-weak fill). */
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The `--wp-*` custom properties that drive the in-dashboard widget live preview. */
export function previewVars(settings: WidgetSettings): Record<string, string> {
  const accent = settings.theme.accent ?? DEFAULT_ACCENT;
  const radius = settings.theme.radius ?? DEFAULT_RADIUS;
  const font = settings.theme.fontFamily ?? DEFAULT_FONT;
  return {
    '--wp-accent': accent,
    '--wp-accent-weak': hexToRgba(accent, 0.12),
    '--wp-radius': `${radius}px`,
    '--wp-font': font,
  };
}

/** The preview stage renders dark only when the merchant pins dark (auto previews light). */
export function isDarkPreview(mode: ThemeMode | undefined): boolean {
  return mode === 'dark';
}

/** The one-line loader `<script>` a merchant pastes into their storefront `<head>` (§3.3). */
export function buildInstallSnippet(opts: { cdnUrl: string; siteKey: string }): string {
  const base = opts.cdnUrl.replace(/\/+$/, '');
  return `<script async src="${base}/widget.js" data-site-key="${opts.siteKey}"></script>`;
}

/** A declarative trigger button (§3.5) — the merchant drops it on each product page. */
export function buildTriggerSnippet(opts: { buttonText: string; productId?: string }): string {
  const productId = opts.productId ?? 'YOUR_PRODUCT_ID';
  return `<button data-lumina-trigger data-lumina-product="${productId}">\n  ${opts.buttonText}\n</button>`;
}
