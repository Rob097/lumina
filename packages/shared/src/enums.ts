import { z } from 'zod';

/**
 * Enums — kept verbatim in sync with the Postgres enums in architecture §5.2 and the public
 * surface in §3.4. These tuples are the single source of truth reused by `@lumina/db`, the API,
 * and the widget. Order matches the DDL.
 */

export const PRODUCT_CATEGORIES = [
  'furniture',
  'lighting',
  'door',
  'window',
  'kitchen',
  'bath',
  'shower',
  'tiles',
  'mirror',
  'decor',
  'renovation',
  'outdoor',
  'fashion',
  'other',
] as const;
export const ProductCategorySchema = z.enum(PRODUCT_CATEGORIES);
export type ProductCategory = z.infer<typeof ProductCategorySchema>;

export const GENERATION_STATUSES = [
  'queued',
  'processing',
  'succeeded',
  'failed',
  'refunded',
] as const;
export const GenerationStatusSchema = z.enum(GENERATION_STATUSES);
export type GenerationStatus = z.infer<typeof GenerationStatusSchema>;

export const KEY_KINDS = ['publishable', 'secret'] as const;
export const KeyKindSchema = z.enum(KEY_KINDS);
export type KeyKind = z.infer<typeof KeyKindSchema>;

export const KEY_ENVS = ['test', 'live'] as const;
export const KeyEnvSchema = z.enum(KEY_ENVS);
export type KeyEnv = z.infer<typeof KeyEnvSchema>;

export const MEMBER_ROLES = ['owner', 'admin', 'member'] as const;
export const MemberRoleSchema = z.enum(MEMBER_ROLES);
export type MemberRole = z.infer<typeof MemberRoleSchema>;

export const LEDGER_REASONS = [
  'purchase',
  'grant',
  'generation',
  'refund',
  'adjustment',
  'expiry',
] as const;
export const LedgerReasonSchema = z.enum(LEDGER_REASONS);
export type LedgerReason = z.infer<typeof LedgerReasonSchema>;

export const PLAN_TIERS = ['free', 'starter', 'growth', 'scale', 'enterprise'] as const;
export const PlanTierSchema = z.enum(PLAN_TIERS);
export type PlanTier = z.infer<typeof PlanTierSchema>;

/** Dashboard notification types — actionable events only (failures + low credits), never per-success. */
export const NOTIFICATION_TYPES = ['generation_failed', 'low_credits', 'payment_failed'] as const;
export const NotificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

/** Delivery channels a merchant can toggle per notification type. */
export const NOTIFICATION_CHANNELS = ['in_app', 'email'] as const;
export const NotificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>;

/** Supported widget locales (§3.4). `auto` resolution happens client-side, falling back to `en`. */
export const LOCALES = ['it', 'en', 'de', 'fr', 'es'] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;
export const DEFAULT_LOCALE: Locale = 'en';
