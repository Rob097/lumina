import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import type { Sql } from 'postgres';
import { createDb, type Database } from './client.js';
import { apiKeys, creditLedger, memberships, merchants, products, widgetConfigs } from './schema.js';
import type { KeyEnv, KeyKind } from '@lumina/shared';

export const DEMO_SLUG = 'demo';
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_GRANT = 100;

export interface GeneratedKey {
  kind: KeyKind;
  env: KeyEnv;
  prefix: string;
  keyHash: string;
  raw: string;
}

export interface SeedResult {
  /** false when the demo merchant already existed (idempotent no-op). */
  created: boolean;
  merchantId: string;
  keys: GeneratedKey[];
}

/** Generate a Stripe-style key: `pk_live_<secret>`. Only the sha256 hash + prefix are stored. */
export function generateKey(kind: KeyKind, env: KeyEnv): GeneratedKey {
  const tag = kind === 'publishable' ? 'pk' : 'sk';
  const secret = randomBytes(24).toString('base64url');
  const raw = `${tag}_${env}_${secret}`;
  const prefix = `${tag}_${env}_${secret.slice(0, 8)}`;
  const keyHash = createHash('sha256').update(raw).digest('hex');
  return { kind, env, prefix, keyHash, raw };
}

/**
 * Idempotent seed: one demo merchant + owner membership + four key pairs + an active widget config
 * + three products + an initial credit grant (ledger row and the denormalized cache stay consistent).
 * Re-running is a no-op once the demo merchant exists.
 */
export async function runSeed(db: Database, client: Sql): Promise<SeedResult> {
  const existing = await db.select().from(merchants).where(eq(merchants.slug, DEMO_SLUG));
  const found = existing[0];
  if (found) {
    return { created: false, merchantId: found.id, keys: [] };
  }

  // The owner user lives in Supabase Auth in production; for local/dev we insert it directly.
  await client`insert into auth.users (id, email) values (${DEMO_USER_ID}::uuid, 'owner@demo.lumina.app') on conflict (id) do nothing`;

  const keys: GeneratedKey[] = [
    generateKey('publishable', 'test'),
    generateKey('secret', 'test'),
    generateKey('publishable', 'live'),
    generateKey('secret', 'live'),
  ];

  const merchantId = await db.transaction(async (tx) => {
    const inserted = (
      await tx
        .insert(merchants)
        .values({
          name: 'Demo Store',
          slug: DEMO_SLUG,
          plan: 'growth',
          creditsBalance: DEMO_GRANT,
          allowedDomains: ['localhost', 'shop.demo.lumina.app'],
        })
        .returning()
    )[0];
    if (!inserted) {
      throw new Error('failed to insert demo merchant');
    }

    await tx.insert(memberships).values({ merchantId: inserted.id, userId: DEMO_USER_ID, role: 'owner' });

    await tx.insert(apiKeys).values(
      keys.map((k) => ({
        merchantId: inserted.id,
        kind: k.kind,
        env: k.env,
        prefix: k.prefix,
        keyHash: k.keyHash,
      })),
    );

    await tx.insert(widgetConfigs).values({
      merchantId: inserted.id,
      isActive: true,
      buttonText: 'Try in your room',
      locale: 'en',
      theme: { accent: '#5A55D6', mode: 'auto', radius: 16 },
      watermark: false,
    });

    await tx.insert(products).values([
      {
        merchantId: inserted.id,
        externalId: 'SKU-1',
        name: 'Aura Floor Lamp',
        category: 'lighting',
        imageUrl: 'https://placehold.co/600x600/1d3a6b/ffffff.png?text=Aura+Floor+Lamp',
        dimensions: { w: 30, h: 150, d: 30, unit: 'cm' },
      },
      {
        merchantId: inserted.id,
        externalId: 'SKU-2',
        name: 'Nube Lounge Chair',
        category: 'furniture',
        imageUrl: 'https://placehold.co/600x600/34383f/ffffff.png?text=Nube+Lounge+Chair',
        dimensions: { w: 80, h: 85, d: 82, unit: 'cm' },
      },
      {
        merchantId: inserted.id,
        externalId: 'SKU-3',
        name: 'Terra Wall Mirror',
        category: 'mirror',
        imageUrl: 'https://placehold.co/600x600/232730/ffffff.png?text=Terra+Wall+Mirror',
        dimensions: { w: 60, h: 100, d: 5, unit: 'cm' },
      },
    ]);

    await tx.insert(creditLedger).values({
      merchantId: inserted.id,
      amount: DEMO_GRANT,
      reason: 'grant',
      note: 'demo seed grant',
    });

    return inserted.id;
  });

  return { created: true, merchantId, keys };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to seed');
  }
  const { db, client } = createDb(url, { max: 1 });
  try {
    const result = await runSeed(db, client);
    if (!result.created) {
      console.log(`✓ demo merchant already seeded (${result.merchantId}); nothing to do`);
      return;
    }
    console.log('✓ seeded demo merchant:', result.merchantId);
    console.log(`  credits granted: ${DEMO_GRANT}`);
    console.log('  API keys (shown once — store securely):');
    for (const k of result.keys) {
      console.log(`    ${k.kind}/${k.env}: ${k.raw}`);
    }
  } finally {
    await client.end();
  }
}

// Run when invoked directly (`pnpm db:seed`), not when imported.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
