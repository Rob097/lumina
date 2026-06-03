/**
 * Loader entry (`widget.js`) — the immutable, year-cacheable line a merchant pastes.
 *
 * Scaffold: creates the `window.Lumina` command-queue stub and injects the content-hashed app bundle.
 * The full loader (read `data-*` config, declarative `[data-lumina-trigger]` delegation, lazy inject)
 * is built test-first in Task 12.
 */
(function bootstrapLoader() {
  const w = window as unknown as { Lumina?: { q?: unknown[] } };
  w.Lumina = w.Lumina ?? { q: [] };

  if (document.querySelector('script[data-lumina-app]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.src = __APP_BUNDLE_URL__;
  script.setAttribute('data-lumina-app', '');
  document.head.appendChild(script);
})();
