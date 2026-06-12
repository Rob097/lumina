import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  GENERATION_STATUSES,
  KEY_ENVS,
  KEY_KINDS,
  LEDGER_REASONS,
  MEMBER_ROLES,
  PLAN_TIERS,
  PRODUCT_CATEGORIES,
  type Dimensions,
  type NotificationPrefs,
  type ResultCta,
} from '@lumina/shared';

/**
 * Drizzle schema — a 1:1 transcription of architecture §5.2. Enum values are imported from
 * `@lumina/shared` so the database, API, and widget never drift. UUIDv4 (`gen_random_uuid()`)
 * primary keys; all timestamps are `timestamptz`.
 *
 * NOTE: RLS, policies, grants, the `auth.users` FK on `memberships`, `current_merchant_ids()`, and
 * `debit_credits()` are NOT expressed here — Drizzle does not model them. They live in the
 * hand-authored migration `drizzle/0001_rls_functions.sql`, applied in journal order after this schema.
 */

// ───────────────────────────── enums ─────────────────────────────
export const productCategory = pgEnum('product_category', PRODUCT_CATEGORIES);
export const generationStatus = pgEnum('generation_status', GENERATION_STATUSES);
export const keyKind = pgEnum('key_kind', KEY_KINDS);
export const keyEnv = pgEnum('key_env', KEY_ENVS);
export const memberRole = pgEnum('member_role', MEMBER_ROLES);
export const ledgerReason = pgEnum('ledger_reason', LEDGER_REASONS);
export const planTier = pgEnum('plan_tier', PLAN_TIERS);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ───────────────────────────── tenants ─────────────────────────────
export const merchants = pgTable('merchants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  plan: planTier('plan').notNull().default('free'),
  creditsBalance: integer('credits_balance').notNull().default(0),
  allowedDomains: text('allowed_domains')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    // FK → auth.users(id) is added in 0001_rls_functions.sql (auth schema is Supabase-managed).
    userId: uuid('user_id').notNull(),
    role: memberRole('role').notNull().default('owner'),
    createdAt: createdAt(),
  },
  (t) => [unique('memberships_merchant_user_uq').on(t.merchantId, t.userId)],
);

// ───────────────────────────── api keys ─────────────────────────────
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    kind: keyKind('kind').notNull(),
    env: keyEnv('env').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    // The raw value of a **publishable** key — it is the public `site_key` that ships in the storefront
    // <script>, so we keep it readable for the install snippet. Always null for secret keys.
    siteKey: text('site_key'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('api_keys_merchant_idx').on(t.merchantId),
    uniqueIndex('api_keys_prefix_uidx').on(t.prefix),
  ],
);

// ───────────────────────────── products ─────────────────────────────
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    externalId: text('external_id'),
    name: text('name').notNull(),
    category: productCategory('category').notNull().default('other'),
    imageUrl: text('image_url').notNull(),
    cleanImageKey: text('clean_image_key'),
    dimensions: jsonb('dimensions').$type<Dimensions>(),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('products_merchant_external_uq').on(t.merchantId, t.externalId),
    index('products_merchant_idx').on(t.merchantId),
    index('products_category_idx').on(t.merchantId, t.category),
  ],
);

// ───────────────────────────── widget config ─────────────────────────────
export const widgetConfigs = pgTable(
  'widget_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').notNull().default(true),
    buttonText: text('button_text').notNull().default('Try in your room'),
    locale: text('locale').notNull().default('en'),
    theme: jsonb('theme').$type<Record<string, unknown>>().notNull().default({}),
    i18n: jsonb('i18n').$type<Record<string, string>>().notNull().default({}),
    resultCta: jsonb('result_cta').$type<ResultCta>(),
    watermark: boolean('watermark').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('widget_active_uidx')
      .on(t.merchantId)
      .where(sql`${t.isActive}`),
  ],
);

// ───────────────────────────── generations ─────────────────────────────
export interface ProductSnapshot {
  name: string;
  category: string;
  imageUrl: string;
}

export const generations = pgTable(
  'generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    status: generationStatus('status').notNull().default('queued'),
    // inputs
    roomKey: text('room_key').notNull(),
    productSnapshot: jsonb('product_snapshot').$type<ProductSnapshot>().notNull(),
    placementHint: text('placement_hint'),
    customInstructions: text('custom_instructions'),
    idempotencyKey: text('idempotency_key').notNull(),
    // outputs
    resultKey: text('result_key'),
    model: text('model'),
    // accounting / ops
    creditsSpent: integer('credits_spent').notNull().default(1),
    costCents: integer('cost_cents'),
    latencyMs: integer('latency_ms'),
    errorCode: text('error_code'),
    anonId: text('anon_id'),
    pageUrl: text('page_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('gen_merchant_created_idx').on(t.merchantId, t.createdAt.desc()),
    index('gen_status_idx').on(t.status),
    uniqueIndex('gen_idem_uidx').on(t.merchantId, t.idempotencyKey),
    index('gen_product_idx').on(t.productId),
  ],
);

export const generationAssets = pgTable(
  'generation_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    generationId: uuid('generation_id')
      .notNull()
      .references(() => generations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    storageKey: text('storage_key').notNull(),
    width: integer('width'),
    height: integer('height'),
    bytes: integer('bytes'),
    createdAt: createdAt(),
  },
  (t) => [index('gen_assets_gen_idx').on(t.generationId)],
);

// ───────────────────────────── credits ─────────────────────────────
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    reason: ledgerReason('reason').notNull(),
    generationId: uuid('generation_id').references(() => generations.id, { onDelete: 'set null' }),
    stripeRef: text('stripe_ref'),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('ledger_merchant_idx').on(t.merchantId, t.createdAt.desc())],
);

// ───────────────────────────── usage events ─────────────────────────────
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    generationId: uuid('generation_id').references(() => generations.id, { onDelete: 'set null' }),
    anonId: text('anon_id'),
    props: jsonb('props').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('usage_merchant_type_time_idx').on(t.merchantId, t.type, t.createdAt.desc())],
);

// ───────────────────────────── billing ─────────────────────────────
export const subscriptions = pgTable('subscriptions', {
  merchantId: uuid('merchant_id')
    .primaryKey()
    .references(() => merchants.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id'),
  plan: planTier('plan').notNull().default('free'),
  status: text('status').notNull().default('active'),
  includedCredits: integer('included_credits').notNull().default(0),
  overageMeter: text('overage_meter'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const webhooksInbox = pgTable('webhooks_inbox', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id').references(() => merchants.id, { onDelete: 'cascade' }),
    actor: text('actor'),
    action: text('action').notNull(),
    target: text('target'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_merchant_idx').on(t.merchantId, t.createdAt.desc())],
);

// ───────────────────────────── notifications ─────────────────────────────
/**
 * Dashboard notifications — one row per merchant member (fan-out), so read-state is per-user.
 * `user_id` references `auth.users` (FK added in the hand-authored RLS migration, like `memberships`).
 * Server-written (service role); a user-scoped RLS read policy keeps it safe + Realtime-ready.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt.desc())],
);

/** Per-member notification preferences (type → channel toggles). One row per (merchant, user). */
export const notificationPrefs = pgTable(
  'notification_prefs',
  {
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    prefs: jsonb('prefs').$type<NotificationPrefs>().notNull().default({}),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.merchantId, t.userId] })],
);

export const schema = {
  merchants,
  memberships,
  apiKeys,
  products,
  widgetConfigs,
  generations,
  generationAssets,
  creditLedger,
  usageEvents,
  subscriptions,
  webhooksInbox,
  auditLog,
  notifications,
  notificationPrefs,
};
