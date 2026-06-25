import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { accounts, apiKeys, memberships, merchants, widgetConfigs, type Database } from '@lumina/db';
import { shopLimit, type KeyEnv, type KeyKind, type PlanTier } from '@lumina/shared';
import { generateApiKey } from './keys.js';

/**
 * Thrown when a workspace can't be created because the owner's account has reached its plan's shop
 * allowance. The route maps this to a 403 `shop_limit` with a helpful, upgrade-pointing message.
 */
export class ShopLimitError extends Error {
  constructor(
    readonly plan: PlanTier,
    readonly limit: number,
  ) {
    super(`shop_limit: ${plan} allows ${limit} shop(s)`);
    this.name = 'ShopLimitError';
  }
}

// Live keys only — test keys added clutter without earning their keep (D-followup). A workspace boots
// with one publishable + one secret; merchants mint fresh pairs from Settings → API keys.
const KEY_MATRIX: ReadonlyArray<{ kind: KeyKind; env: KeyEnv }> = [
  { kind: 'publishable', env: 'live' },
  { kind: 'secret', env: 'live' },
];

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'merchant';
}

export interface BootstrapKey {
  kind: KeyKind;
  env: KeyEnv;
  prefix: string;
  /** Raw key — surface once to the merchant, never persisted (only the hash is stored). */
  key: string;
}

export interface BootstrapResult {
  merchantId: string;
  created: boolean;
  /** Populated only on the created path (first login). */
  keys: BootstrapKey[];
}

/**
 * Create a new workspace (merchant) owned by the user: the merchant row, an owner membership, a live
 * publishable + secret key pair, and an active widget config — all in one transaction. Used both by
 * first-login bootstrap and by the "create another workspace" flow (multi-workspace). `slugBase` lets
 * the caller derive the slug from something other than the display name (e.g. the email local part).
 */
export async function createWorkspace(
  db: Database,
  input: { userId: string; name: string; slugBase?: string },
): Promise<BootstrapResult> {
  return db.transaction(async (tx) => {
    // Resolve (or create) the owner's billing account, then enforce the plan's shop allowance. The
    // first workspace creates the account (free plan); later ones reuse it and count against the cap.
    let acc = (
      await tx
        .select({ id: accounts.id, plan: accounts.plan })
        .from(accounts)
        .where(eq(accounts.ownerUserId, input.userId))
        .limit(1)
    )[0];
    if (!acc) {
      acc =
        (
          await tx
            .insert(accounts)
            .values({ ownerUserId: input.userId })
            .onConflictDoNothing()
            .returning({ id: accounts.id, plan: accounts.plan })
        )[0] ??
        // Lost a create race — read the row the other writer just made.
        (
          await tx
            .select({ id: accounts.id, plan: accounts.plan })
            .from(accounts)
            .where(eq(accounts.ownerUserId, input.userId))
            .limit(1)
        )[0];
    }
    if (!acc) {
      throw new Error('bootstrap: account resolution failed');
    }
    const shopCount = (
      await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(merchants)
        .where(eq(merchants.accountId, acc.id))
    )[0]?.n ?? 0;
    const limit = shopLimit(acc.plan);
    if (shopCount >= limit) {
      throw new ShopLimitError(acc.plan, limit);
    }

    const base = slugify(input.slugBase ?? input.name);
    let slug = base;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await tx
        .select({ id: merchants.id })
        .from(merchants)
        .where(eq(merchants.slug, slug))
        .limit(1);
      if (!clash[0]) {
        break;
      }
      slug = `${base}-${randomBytes(2).toString('hex')}`;
    }

    const merchantRows = await tx
      .insert(merchants)
      .values({ name: input.name, slug, accountId: acc.id })
      .returning({ id: merchants.id });
    const merchant = merchantRows[0];
    if (!merchant) {
      throw new Error('bootstrap: merchant insert failed');
    }
    const merchantId = merchant.id;

    await tx.insert(memberships).values({ merchantId, userId: input.userId, role: 'owner' });

    const generated = KEY_MATRIX.map((spec) => {
      const g = generateApiKey(spec.kind, spec.env);
      return { spec, g };
    });
    await tx.insert(apiKeys).values(
      generated.map(({ spec, g }) => ({
        merchantId,
        kind: spec.kind,
        env: spec.env,
        prefix: g.prefix,
        keyHash: g.keyHash,
        // A publishable key IS the public site_key — persist the raw value so the install snippet
        // self-fills. Without this the widget loader gets a broken placeholder.
        siteKey: spec.kind === 'publishable' ? g.raw : null,
      })),
    );

    await tx.insert(widgetConfigs).values({ merchantId, isActive: true });

    const keys: BootstrapKey[] = generated.map(({ spec, g }) => ({
      kind: spec.kind,
      env: spec.env,
      prefix: g.prefix,
      key: g.raw,
    }));
    return { merchantId, created: true, keys };
  });
}

/**
 * Idempotent first-login bootstrap: ensure the Supabase user owns a merchant. On first call creates the
 * workspace (via {@link createWorkspace}); safe to call on every login — subsequent calls are no-ops.
 */
export async function ensureMerchantForUser(
  db: Database,
  input: { userId: string; email: string },
): Promise<BootstrapResult> {
  const existing = await db
    .select({ merchantId: memberships.merchantId })
    .from(memberships)
    .where(eq(memberships.userId, input.userId))
    .limit(1);
  const found = existing[0];
  if (found) {
    return { merchantId: found.merchantId, created: false, keys: [] };
  }
  return createWorkspace(db, {
    userId: input.userId,
    name: input.email,
    slugBase: input.email.split('@')[0] ?? 'merchant',
  });
}
