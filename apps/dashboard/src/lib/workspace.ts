import { cookies } from 'next/headers';
import type { MeMerchant } from '@lumina/shared';

/** Cookie naming the active workspace; forwarded to the API where the guard re-validates membership. */
export const ACTIVE_MERCHANT_COOKIE = 'active_merchant';

/**
 * Resolve which workspace the dashboard renders for: the one named by the `active_merchant` cookie when the
 * user still belongs to it, else the first membership. Mirrors the API guard so UI + data stay in sync.
 */
export async function resolveActiveMerchant(
  merchants: MeMerchant[],
): Promise<MeMerchant | undefined> {
  const id = (await cookies()).get(ACTIVE_MERCHANT_COOKIE)?.value;
  return merchants.find((m) => m.id === id) ?? merchants[0];
}
