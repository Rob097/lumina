/**
 * Single source of truth for the e-commerce platforms LUMINA knows about. Drives two surfaces:
 *  - the Script & Install picker (which platforms have a one-click installer vs. "coming soon"), and
 *  - the Widget Settings → Result CTA autopopulate (typical add-to-cart link per platform).
 * The marks render via `<BrandIcon name=… />`; keep `BRAND_ICON_NAMES` in sync with that component.
 */

export const BRAND_ICON_NAMES = [
  'script',
  'wordpress',
  'shopify',
  'woocommerce',
  'wix',
  'squarespace',
  'link',
] as const;
export type BrandIconName = (typeof BRAND_ICON_NAMES)[number];

export type InstallStatus = 'available' | 'coming-soon';

export interface InstallPlatform {
  id: string;
  name: string;
  brandIcon: BrandIconName;
  status: InstallStatus;
  /** One-line blurb shown under the card title. */
  blurb: string;
}

/** The install picker cards. The generic script works anywhere today; storefront installers are next. */
export const INSTALL_PLATFORMS: InstallPlatform[] = [
  {
    id: 'script',
    name: 'Script — any platform',
    brandIcon: 'script',
    status: 'available',
    blurb: 'Paste one <script> line. Works on any website or CMS.',
  },
  {
    id: 'wordpress',
    name: 'WordPress',
    brandIcon: 'wordpress',
    status: 'coming-soon',
    blurb: 'One-click plugin install.',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    brandIcon: 'shopify',
    status: 'coming-soon',
    blurb: 'Add the block from the Shopify App Store.',
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    brandIcon: 'woocommerce',
    status: 'coming-soon',
    blurb: 'WooCommerce extension.',
  },
  {
    id: 'wix',
    name: 'Wix',
    brandIcon: 'wix',
    status: 'coming-soon',
    blurb: 'Wix App Market integration.',
  },
  {
    id: 'squarespace',
    name: 'Squarespace',
    brandIcon: 'squarespace',
    status: 'coming-soon',
    blurb: 'Squarespace extension.',
  },
];

export interface CtaPreset {
  label: string;
  urlTemplate: string;
}

export interface CtaPlatform {
  id: string;
  name: string;
  brandIcon: BrandIconName;
  cta: CtaPreset;
}

/**
 * Result-CTA presets. `{productId}` is filled by the merchant's storefront from the widget's
 * `data-lumina-product`; `{productUrl}` is the plain product link for storefronts without a stable
 * add-to-cart URL. Merchants can always edit the fields after picking a preset.
 */
export const CTA_PLATFORMS: CtaPlatform[] = [
  {
    id: 'shopify',
    name: 'Shopify',
    brandIcon: 'shopify',
    cta: { label: 'Add to cart', urlTemplate: '/cart/add?id={productId}' },
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    brandIcon: 'woocommerce',
    cta: { label: 'Add to cart', urlTemplate: '/?add-to-cart={productId}' },
  },
  {
    id: 'wix',
    name: 'Wix',
    brandIcon: 'wix',
    cta: { label: 'View product', urlTemplate: '/product-page/{productId}' },
  },
  {
    id: 'generic',
    name: 'Generic link',
    brandIcon: 'link',
    cta: { label: 'View product', urlTemplate: '{productUrl}' },
  },
];

/** The add-to-cart / product-link preset for a platform id, or undefined if we have none. */
export function ctaForPlatform(id: string): CtaPreset | undefined {
  return CTA_PLATFORMS.find((p) => p.id === id)?.cta;
}
