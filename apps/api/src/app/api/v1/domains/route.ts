import { eq } from 'drizzle-orm';
import { merchants } from '@lumina/db';
import { DomainsSchema } from '@lumina/shared';
import { requireMerchant } from '@/lib/guard';
import { errorResponse, jsonResponse } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const rows = await guard.db
    .select({ domains: merchants.allowedDomains })
    .from(merchants)
    .where(eq(merchants.id, guard.merchantId))
    .limit(1);
  return jsonResponse({ domains: rows[0]?.domains ?? [] });
}

export async function PUT(request: Request): Promise<Response> {
  const guard = await requireMerchant();
  if (!guard.ok) {
    return guard.response;
  }
  const parsed = DomainsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse('invalid_input', 'Invalid domains list');
  }
  await guard.db
    .update(merchants)
    .set({ allowedDomains: parsed.data.domains, updatedAt: new Date() })
    .where(eq(merchants.id, guard.merchantId));
  return jsonResponse({ domains: parsed.data.domains });
}
