/**
 * @lumina/widget — Preact + Vite embeddable widget (loader.js + widget.[hash].js, Shadow DOM).
 *
 * M0 stub. The loader, command queue, and Preact app land in M3 (architecture §3). This placeholder
 * imports the shared `LuminaConfig` type to keep the public-API contract in sync.
 */
import type { LuminaConfig } from '@lumina/shared';

export const widgetGlobalName = 'Lumina' as const;

export function describeConfig(config: LuminaConfig): string {
  return `LUMINA widget for site_key ${config.siteKey}`;
}
