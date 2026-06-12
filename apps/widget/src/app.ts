/**
 * App-bundle entry (`widget.[hash].js`). Boots a session on demand: fetch remote config → merge →
 * construct the controller, mount the Shadow-DOM UI, bind declarative triggers — then expose the public
 * `window.Lumina` surface and replay the loader's buffered command queue. This is the integration glue;
 * its parts are unit-tested individually and the whole path is covered by the Playwright E2E.
 */
import { h } from 'preact';
import type { LuminaConfig } from '@lumina/shared';
import { Emitter } from './core/emitter.js';
import { ApiClient } from './core/api.js';
import { getAnonId } from './core/anon.js';
import { normalizeLocale, mergeConfig, type EffectiveConfig } from './core/config.js';
import { createReporter } from './core/report.js';
import { LuminaController } from './core/controller.js';
import { bindTriggers } from './core/binder.js';
import { mountLaunchers } from './core/launcher.js';
import { createLumina, installQueue, type LuminaSession } from './core/lumina.js';
import { createShadowMount } from './ui/mount.js';
import { themeVars } from './ui/theme.js';
import { createTranslator } from './core/i18n.js';
import { App } from './ui/App.js';
import { WIDGET_VERSION } from './index.js';
import styles from './ui/styles.css?inline';

const emitter = new Emitter({ win: window });

async function boot(localConfig: LuminaConfig): Promise<LuminaSession> {
  const reporter = createReporter({
    dsn: __SENTRY_DSN__ || undefined,
    siteKey: localConfig.siteKey,
  });
  const api = new ApiClient({ baseUrl: __API_URL__, siteKey: localConfig.siteKey });
  const remote = await api.getConfig();
  // Pass the page's <html lang> only as a fallback — the merchant's configured locale wins over it.
  const pageLocale = normalizeLocale(document.documentElement.getAttribute('lang'));
  let effective: EffectiveConfig = mergeConfig(localConfig, remote, pageLocale);

  const controller = new LuminaController({
    config: effective,
    api,
    emitter,
    anonId: getAnonId(),
    pageUrl: location.href,
    reportError: reporter,
  });

  const mount = createShadowMount(document, { theme: themeVars(effective.theme), styles });
  let translate = createTranslator(effective.locale, effective.i18n);
  const rerender = (): void => mount.render(h(App, { controller, config: effective, t: translate }));
  rerender();

  bindTriggers({ doc: document, onOpen: (opts) => controller.open(opts), onPreload: () => {} });
  mountLaunchers({
    doc: document,
    onOpen: (opts) => controller.open(opts),
    label: effective.buttonText,
    theme: themeVars(effective.theme),
  });
  controller.trackImpression();

  return {
    controller: {
      open: (opts) => controller.open(opts),
      close: (reason) => controller.close(reason),
    },
    applyConfig: (partial) => {
      effective = mergeConfig(
        { ...localConfig, ...partial, locale: partial.locale ?? effective.locale },
        remote,
      );
      translate = createTranslator(effective.locale, effective.i18n);
      const container = mount.root.querySelector('[data-lumina-container]');
      if (container instanceof HTMLElement) {
        for (const [key, value] of Object.entries(themeVars(effective.theme))) {
          container.style.setProperty(key, value);
        }
      }
      rerender();
    },
  };
}

const lumina = createLumina({ version: WIDGET_VERSION, emitter, boot });
installQueue(window as unknown as { Lumina?: unknown }, lumina);
