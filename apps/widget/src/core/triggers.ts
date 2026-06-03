import {
  OpenOptionsSchema,
  PRODUCT_CATEGORIES,
  type OpenOptions,
  type ProductCategory,
} from '@lumina/shared';

/**
 * Declarative trigger parsing (§3.5). Turns a `[data-lumina-trigger]` element's `data-lumina-*`
 * attributes into validated `OpenOptions`. Returns `null` when the element carries neither a
 * registered `productId` nor a valid inline product, so callers can simply ignore it.
 */
export function parseTrigger(el: Element): OpenOptions | null {
  const productId = el.getAttribute('data-lumina-product') ?? undefined;
  const name = el.getAttribute('data-lumina-product-name') ?? undefined;
  const imageUrl = el.getAttribute('data-lumina-product-image') ?? undefined;
  const rawCategory = el.getAttribute('data-lumina-category') ?? undefined;
  const locale = el.getAttribute('data-lumina-locale') ?? undefined;

  const category =
    rawCategory && (PRODUCT_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as ProductCategory)
      : undefined;

  const opts: Record<string, unknown> = {};
  if (productId) opts.productId = productId;
  if (name && imageUrl) {
    opts.product = { name, imageUrl, ...(category ? { category } : {}) };
  }
  if (locale) opts.metadata = { locale };

  const parsed = OpenOptionsSchema.safeParse(opts);
  if (parsed.success) return parsed.data;

  // A malformed inline product shouldn't discard a usable productId.
  if (productId) {
    const fallback = OpenOptionsSchema.safeParse({
      productId,
      ...(locale ? { metadata: { locale } } : {}),
    });
    if (fallback.success) return fallback.data;
  }
  return null;
}
