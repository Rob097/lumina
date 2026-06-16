import { createOrchestratorFromEnv, type AIOrchestrator } from '@lumina/ai';
import { and, eq } from 'drizzle-orm';
import { products, type Database } from '@lumina/db';
import { getDb } from '@/lib/db';
import { createR2FromEnv } from '@/lib/storage/r2';
import { reportError } from '@/lib/observability';
import { inngest } from './client.js';
import { productCleanKey, type StoragePort } from './workflow.js';

/**
 * Eager product-cutout pre-compute (Phase 1 / D63). The generation workflow already computes the
 * background-removed cutout lazily on first use; this computes it **once on product create / bulk upsert**
 * so the first generation isn't slowed by it. Idempotent (skips when `clean_image_key` is already set) and
 * best-effort (no provider / a failure leaves the product usable — the lazy guard still covers it).
 */
export interface ProductImageDeps {
  db: Database;
  orchestrator: Pick<AIOrchestrator, 'bgRemoval'>;
  storage: Pick<StoragePort, 'putObject'>;
  reportError?: (err: unknown, context: Record<string, unknown>) => void;
}

export type ProductImageOutcome = 'cached' | 'skipped' | 'noop';

export async function processProductImage(
  deps: ProductImageDeps,
  { productId, merchantId }: { productId: string; merchantId: string },
): Promise<ProductImageOutcome> {
  const rows = await deps.db
    .select({ imageUrl: products.imageUrl, cleanImageKey: products.cleanImageKey })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.merchantId, merchantId)))
    .limit(1);
  const product = rows[0];
  if (!product || product.cleanImageKey) {
    return 'skipped'; // missing/not-ours, or already cached → idempotent no-op
  }

  try {
    const cutout = await deps.orchestrator.bgRemoval({ url: product.imageUrl });
    if (!cutout) {
      return 'noop'; // no bg-removal provider configured
    }
    const key = productCleanKey(merchantId, productId);
    await deps.storage.putObject(key, cutout.bytes, cutout.contentType);
    await deps.db
      .update(products)
      .set({ cleanImageKey: key })
      .where(and(eq(products.id, productId), eq(products.merchantId, merchantId)));
    return 'cached';
  } catch (err) {
    deps.reportError?.(err, { productId, merchantId, stage: 'product_image_process' });
    return 'noop';
  }
}

/** Send the eager-cutout event for a product. Best-effort — a failure here never blocks product writes. */
export async function enqueueProductImageProcess(merchantId: string, productId: string): Promise<void> {
  try {
    await inngest.send({ name: 'product.image.process', data: { productId, merchantId } });
  } catch (err) {
    reportError(err, { productId, merchantId, stage: 'product_image_enqueue' });
  }
}

/** Durable `product.image.process` worker — computes + caches the product cutout (best-effort). */
export const productImageProcess = inngest.createFunction(
  {
    id: 'product-image-process',
    retries: 2,
    concurrency: [
      { limit: Number(process.env.GLOBAL_CONCURRENCY ?? 20) },
      { key: 'event.data.merchantId', limit: Number(process.env.MERCHANT_CONCURRENCY ?? 3) },
    ],
  },
  { event: 'product.image.process' },
  async ({ event, step }) =>
    step.run('process-product-image', async () => {
      const storage = createR2FromEnv(process.env);
      if (!storage) {
        throw new Error('R2 is not configured');
      }
      return processProductImage(
        { db: getDb(), orchestrator: createOrchestratorFromEnv(process.env), storage, reportError },
        { productId: event.data.productId, merchantId: event.data.merchantId },
      );
    }),
);
