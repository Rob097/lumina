/**
 * App-bundle entry (`widget.[hash].js`) — the self-executing bundle the loader injects.
 *
 * Scaffold: for now it just records the version on `window.Lumina`. The full bootstrap (build the real
 * `window.Lumina` surface from `createLumina()` and drain the buffered command queue) lands in Task 11.
 */
import { WIDGET_VERSION } from './index.js';

const w = window as unknown as { Lumina?: { version?: string; q?: unknown[] } };
w.Lumina = w.Lumina ?? { q: [] };
w.Lumina.version = WIDGET_VERSION;
