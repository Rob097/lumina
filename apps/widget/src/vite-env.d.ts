/// <reference types="vite/client" />

/** Injected at build time by build.mjs (D22): the URL of the content-hashed app bundle. */
declare const __APP_BUNDLE_URL__: string;

/** Public widget API base URL (build-time; PUBLIC_API_URL). */
declare const __API_URL__: string;

/** Public Sentry DSN for widget error reporting (build-time; PUBLIC_SENTRY_DSN; may be empty). */
declare const __SENTRY_DSN__: string;
