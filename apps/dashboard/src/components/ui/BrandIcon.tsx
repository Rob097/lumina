import type { BrandIconName } from '@/lib/platforms';

/**
 * Platform brand tiles for the install picker + Result-CTA presets. We render a brand-coloured rounded
 * tile with a short white monogram rather than copying each vendor's trademarked logo path — it stays
 * recognisable (colour + mark) without shipping forged vector art, and scales cleanly at any size.
 */
const BRAND: Record<BrandIconName, { color: string; label: string }> = {
  script: { color: '#0f62fe', label: '</>' },
  wordpress: { color: '#21759b', label: 'W' },
  shopify: { color: '#008060', label: 'S' },
  woocommerce: { color: '#7f54b3', label: 'Woo' },
  wix: { color: '#0c0c0c', label: 'Wix' },
  squarespace: { color: '#121212', label: 'Sq' },
  link: { color: '#6b7280', label: '↗' },
};

export function BrandIcon({ name, size = 28 }: { name: BrandIconName; size?: number }) {
  const b = BRAND[name];
  const fs = b.label.length <= 1 ? 11 : b.label.length === 2 ? 9 : 7;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6" fill={b.color} />
      <text
        x="12"
        y="13"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#fff"
        fontFamily="var(--font-ui), system-ui, sans-serif"
        fontWeight={700}
        fontSize={fs}
      >
        {b.label}
      </text>
    </svg>
  );
}
