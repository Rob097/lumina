import { DEFAULT_Z_INDEX, type Theme } from '@lumina/shared';

/**
 * Theme tokens → CSS custom properties applied on the Shadow root container (§3.7). Nothing leaks in
 * or out of the host page. `auto` mode uses the light palette as the default; the shadow stylesheet's
 * `prefers-color-scheme` media query can override it.
 */
export function themeVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  if (theme.accent) vars['--lumina-accent'] = theme.accent;
  else vars['--lumina-accent'] = '#5A55D6';
  vars['--lumina-radius'] = `${theme.radius ?? 16}px`;
  vars['--lumina-z'] = String(theme.zIndex ?? DEFAULT_Z_INDEX);
  if (theme.fontFamily) vars['--lumina-font'] = theme.fontFamily;

  const mode = theme.mode ?? 'auto';
  vars['--lumina-mode'] = mode;
  if (mode === 'dark') {
    vars['--lumina-bg'] = '#1a1822';
    vars['--lumina-fg'] = '#f3f2f8';
    vars['--lumina-muted'] = '#8a8698';
    vars['--lumina-surface'] = '#221f2d';
  } else {
    vars['--lumina-bg'] = '#ffffff';
    vars['--lumina-fg'] = '#181621';
    vars['--lumina-muted'] = '#76727f';
    vars['--lumina-surface'] = '#f4f3f8';
  }
  return vars;
}
