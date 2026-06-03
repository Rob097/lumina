/**
 * Loader entry (`widget.js`) — the immutable, year-cacheable line a merchant pastes (§3.2). It only
 * wires globals to the tested `bootLoader`; all logic lives in `core/loader-core.ts`. `__APP_BUNDLE_URL__`
 * is injected at build time (D22) and points at the content-hashed app bundle.
 */
import { bootLoader, resolveScript, type LoaderWindow } from './core/loader-core.js';

bootLoader({
  win: window as unknown as LoaderWindow,
  doc: document,
  script: resolveScript(document),
  appUrl: __APP_BUNDLE_URL__,
});
