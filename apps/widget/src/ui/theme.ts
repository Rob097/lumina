import { DEFAULT_Z_INDEX, type Theme } from '@lumina/shared';

/**
 * Theme tokens → CSS custom properties applied on the Shadow root container (§3.7). Nothing leaks in
 * or out of the host page. `auto` mode uses the light palette as the default; the shadow stylesheet's
 * `prefers-color-scheme` media query can override it.
 */
export function themeVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  if (theme.accent) vars['--lumina-accent'] = theme.accent;
  else vars['--lumina-accent'] = '#0F62FE';
  vars['--lumina-radius'] = `${theme.radius ?? 16}px`;
  vars['--lumina-z'] = String(theme.zIndex ?? DEFAULT_Z_INDEX);
  if (theme.fontFamily) vars['--lumina-font'] = theme.fontFamily;

  const mode = theme.mode ?? 'auto';
  vars['--lumina-mode'] = mode;
  if (mode === 'dark') {
    vars['--lumina-bg'] = '#16161a';
    vars['--lumina-fg'] = '#f4f4f5';
    vars['--lumina-muted'] = '#a1a1aa';
    vars['--lumina-surface'] = '#1f1f24';
  } else {
    vars['--lumina-bg'] = '#ffffff';
    vars['--lumina-fg'] = '#18181b';
    vars['--lumina-muted'] = '#71717a';
    vars['--lumina-surface'] = '#f4f4f5';
  }
  return vars;
}
