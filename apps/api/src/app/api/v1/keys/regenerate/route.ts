import { requireMerchant } from '@/lib/guard';
import { jsonResponse } from '@/lib/http';
import { regenerateLiveKeys } from '@/lib/key-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /v1/keys/regenerate — replace the workspace's keys with a fresh live publishable + secret pair,
 * revoking the old ones. Both raw values are revealed exactly once. The publishable is the public
 * site_key, so the merchant must update their widget snippet afterwards.
 */
export async function POST(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const keys = await regenerateLiveKeys(guard.db, guard.merchantId);
  return jsonResponse(
    { publishable: keys.publishable.key, secret: keys.secret.key },
    { status: 201 },
  );
}
