import { z } from 'zod';
import { LocaleSchema } from './enums.js';
import { InlineProductSchema } from './product.js';

/** Default modal stacking context, kept below the 32-bit ceiling (§3.4). */
export const DEFAULT_Z_INDEX = 2147483000;

export const ThemeModeSchema = z.enum(['light', 'dark', 'auto']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

/** Theme tokens applied as CSS custom properties inside the Shadow root (§3.4 / §3.7). */
export const ThemeSchema = z.object({
  accent: z.string().optional(),
  mode: ThemeModeSchema.optional(),
  radius: z.number().nonnegative().optional(),
  fontFamily: z.string().optional(),
  zIndex: z.number().int().optional(),
});
export type Theme = z.infer<typeof ThemeSchema>;

/**
 * Serializable widget configuration (the subset readable from `data-*` attributes or `init()`).
 * The runtime `LuminaConfig` type additionally allows a non-serializable `onReady` callback (§3.4).
 */
export const LuminaConfigSchema = z.object({
  siteKey: z.string().min(1),
  locale: LocaleSchema.optional(),
  buttonText: z.string().optional(),
  theme: ThemeSchema.optional(),
  watermark: z.boolean().optional(),
  defaultProductSelector: z.string().optional(),
});
export type LuminaConfig = z.infer<typeof LuminaConfigSchema> & {
  onReady?: () => void;
};

/**
 * Options for `Lumina.open()` (§3.4). Either a registered `productId` or an inline `product` is
 * required. `container` enables inline/embedded mode instead of a modal (§3.8).
 */
export const OpenOptionsSchema = z
  .object({
    productId: z.string().optional(),
    product: InlineProductSchema.optional(),
    prefillRoomUrl: z.string().url().optional(),
    container: z.string().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  })
  .refine((opts) => Boolean(opts.productId) || Boolean(opts.product), {
    message: 'Either productId or an inline product is required',
    path: ['productId'],
  });
export type OpenOptions = z.infer<typeof OpenOptionsSchema>;
