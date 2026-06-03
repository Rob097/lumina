/**
 * @lumina/widget — public type surface.
 *
 * Re-exports the wire-contract types a consumer (or the merchant's own TypeScript) needs to talk to
 * the widget. The runtime lives in the loader (`widget.js`) + the content-hashed app bundle; this
 * module carries types only (erased at build) plus the bundle version string.
 */
export type { LuminaConfig, OpenOptions, WidgetEventName } from '@lumina/shared';

/** Loaded bundle version, exposed as `window.Lumina.version` (§3.4). */
export const WIDGET_VERSION = '0.1.0';
