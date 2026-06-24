/**
 * @lumina/ui — the LUMINA design system.
 *
 * The visual layer ships as global CSS (`@lumina/ui/styles.css` → tokens + components + app shell),
 * ported verbatim from the Claude Design bundle (D27). This module carries the small set of
 * framework-agnostic constants the dashboard shell needs — the navigation model and brand defaults.
 */

/** Brand defaults (the source of truth for color/radius is `styles/tokens.css`). */
export const BRAND = {
  accent: '#0F62FE',
  radiusDefault: 16,
} as const;

export type NavGroupId = 'main' | 'configure';

export interface NavGroup {
  id: NavGroupId;
  label?: string;
}

export interface NavItem {
  key: string;
  label: string;
  href: string;
  group: NavGroupId;
  /** Icon key resolved by the dashboard's <Icon> component. */
  icon: string;
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'main' },
  { id: 'configure', label: 'Configure' },
];

/** Sidebar navigation (matches the design prototype's order + grouping). */
export const NAV_ITEMS: readonly NavItem[] = [
  { key: 'overview', label: 'Overview', href: '/overview', group: 'main', icon: 'overview' },
  { key: 'studio', label: 'Studio', href: '/studio', group: 'main', icon: 'studio' },
  { key: 'generations', label: 'Generations', href: '/generations', group: 'main', icon: 'generations' },
  { key: 'products', label: 'Products', href: '/products', group: 'main', icon: 'products' },
  { key: 'analytics', label: 'Analytics', href: '/analytics', group: 'main', icon: 'analytics' },
  { key: 'script', label: 'Script & install', href: '/script', group: 'configure', icon: 'script' },
  { key: 'widget', label: 'Widget settings', href: '/widget', group: 'configure', icon: 'widget' },
  { key: 'billing', label: 'Credits & billing', href: '/billing', group: 'configure', icon: 'billing' },
  { key: 'settings', label: 'Settings', href: '/settings', group: 'configure', icon: 'settings' },
  { key: 'support', label: 'Support', href: '/support', group: 'configure', icon: 'support' },
] as const;

/** Widget Settings live-preview states (§ Widget Settings prototype). */
export const PREVIEW_STATES = ['button', 'modal', 'result'] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

/**
 * Resolve the active nav item from a pathname (longest matching href wins, so `/products/123`
 * highlights Products). Returns the item `key` or `undefined`.
 */
export function activeNavKey(pathname: string): string | undefined {
  let best: NavItem | undefined;
  for (const item of NAV_ITEMS) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best?.key;
}
