/**
 * @lumina/ui — shared design tokens + shadcn/ui components (Tailwind theme).
 *
 * M0 stub. Real components + the Tailwind preset land in M4. The design tokens below are the
 * single source of truth for brand color/radius and are intentionally framework-agnostic.
 */
export const designTokens = {
  color: {
    accent: '#0F62FE',
  },
  radius: {
    md: 16,
  },
} as const;

export type DesignTokens = typeof designTokens;
