import {
  DEFAULT_LOCALE,
  DEFAULT_Z_INDEX,
  LOCALES,
  type Locale,
  type LuminaConfig,
  type ResultCta,
  type Theme,
  type WidgetConfigResponse,
  type WidgetGuide,
  type WidgetLimits,
} from '@lumina/shared';

/**
 * Config + locale resolution (§3.4). Three inputs combine into the `EffectiveConfig` the runtime uses:
 *   1. the `data-*` on the `<script>` tag (`readScriptDataset`),
 *   2. the `init()` config a developer passes,
 *   3. the remote `GET /widget/config` response.
 * Local look-and-feel (theme/locale/buttonText) wins; the server owns enabling, limits, the result CTA,
 * and the watermark (forced on for the free plan).
 */

/** `auto` binds `[data-lumina-trigger]` elements; `manual` leaves binding to the developer (§3.5). */
export type WidgetMode = 'auto' | 'manual';

export interface ScriptDataset {
  config: Partial<LuminaConfig>;
  mode: WidgetMode;
}

/** The fully-resolved config the controller + UI consume. */
export interface EffectiveConfig {
  siteKey: string;
  enabled: boolean;
  locale: Locale;
  buttonText: string;
  theme: Required<Pick<Theme, 'zIndex'>> & Theme;
  watermark: boolean;
  i18n: Record<string, string>;
  limits: WidgetLimits;
  resultCta: ResultCta | null;
  /** Generic pre-upload guide (image + optional title/body); null when the merchant hasn't enabled one. */
  guide: WidgetGuide | null;
  defaultProductSelector?: string;
}

/** Normalize a raw locale string (`it-IT` → `it`, `EN` → `en`); returns undefined if unsupported. */
export function normalizeLocale(value?: string | null): Locale | undefined {
  if (!value) return undefined;
  const two = value.trim().toLowerCase().slice(0, 2);
  return (LOCALES as readonly string[]).includes(two) ? (two as Locale) : undefined;
}

/** Resolve the active locale: explicit → `<html lang>` (2-letter) → `en` (§3.4). */
export function resolveLocale(explicit?: string | null, htmlLang?: string | null): Locale {
  return normalizeLocale(explicit) ?? normalizeLocale(htmlLang) ?? DEFAULT_LOCALE;
}

/** Parse the `<script>` tag's `data-*` attributes into a partial config + binding mode (§3.5). */
export function readScriptDataset(el: Element): ScriptDataset {
  const config: Partial<LuminaConfig> = {};

  const siteKey = el.getAttribute('data-site-key');
  if (siteKey) config.siteKey = siteKey;

  const locale = normalizeLocale(el.getAttribute('data-lumina-locale'));
  if (locale) config.locale = locale;

  const mode: WidgetMode = el.getAttribute('data-lumina-mode') === 'manual' ? 'manual' : 'auto';
  return { config, mode };
}

/**
 * Combine the local (`init`/`data-*`) config with the remote config into the effective config.
 *
 * Locale precedence (§3.4): an explicit local locale (`data-lumina-locale`/`init`) wins; otherwise the
 * merchant's dashboard-configured (`server`) locale is authoritative; the host page's `<html lang>`
 * (`pageLocale`) is only a last-ditch fallback so an Italian storefront can't silently override a
 * merchant who set English.
 */
export function mergeConfig(
  local: LuminaConfig,
  server: WidgetConfigResponse,
  pageLocale?: Locale,
): EffectiveConfig {
  const theme: EffectiveConfig['theme'] = {
    ...server.theme,
    ...local.theme,
    zIndex: local.theme?.zIndex ?? server.theme.zIndex ?? DEFAULT_Z_INDEX,
  };

  return {
    siteKey: local.siteKey,
    enabled: server.enabled,
    locale: local.locale ?? server.locale ?? pageLocale ?? DEFAULT_LOCALE,
    buttonText: local.buttonText ?? server.buttonText,
    theme,
    // The server forces the watermark on for the free plan; a merchant may also opt in locally.
    watermark: server.watermark || Boolean(local.watermark),
    i18n: server.i18n,
    limits: server.limits,
    resultCta: server.resultCta,
    // The pre-upload guide is owned by the server (merchant dashboard); the widget only displays it.
    guide: server.guide ?? null,
    defaultProductSelector: local.defaultProductSelector,
  };
}
