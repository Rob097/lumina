export { buildAnnotation, normalizedPoint } from '@lumina/shared';

/** Pure helpers for the Studio room annotator (F3). The generic stroke math lives in @lumina/shared (shared
 * with the widget); only the dashboard-specific accent resolution lives here. */

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Brand accent fallback when the resolved CSS color isn't a usable #rrggbb. */
const FALLBACK_ACCENT = '#5a55d6';

/** Resolve a usable #rrggbb stroke color, falling back to the brand accent. */
export function annotationColor(raw: string | null | undefined, fallback: string = FALLBACK_ACCENT): string {
  const v = (raw ?? '').trim();
  return HEX.test(v) ? v : fallback;
}
