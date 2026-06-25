import './billing.css';
import { fetchBillingPlans, fetchCredits, fetchMe } from '@/lib/api';
import { PLAN_CATALOG, buildBillingPlans } from '@lumina/shared';
import { EmptyState } from '@/components/ui/EmptyState';
import { resolveActiveMerchant } from '@/lib/workspace';
import { BillingView } from './BillingView';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ status }, plans, credits, me] = await Promise.all([
    searchParams,
    fetchBillingPlans(),
    fetchCredits(),
    fetchMe(),
  ]);

  // Plans come from the API; if billing isn't wired yet, fall back to the static catalog (free tier).
  const resolved = plans ?? buildBillingPlans('free');
  if (!resolved.plans.length || !PLAN_CATALOG) {
    return <EmptyState icon="billing" title="Billing unavailable" body="Try again in a moment." />;
  }

  // Shop usage counts ACTIVE (non-suspended) workspaces. `maxShops` is Infinity for Enterprise → pass null
  // (JSON can't carry Infinity) and render it as "unlimited".
  const allMerchants = me?.merchants ?? [];
  const activeMerchants = allMerchants.filter((m) => !m.suspended);
  const shopCount = activeMerchants.length || 1;
  const rawMax = PLAN_CATALOG[resolved.currentPlan].maxShops;
  const maxShops = Number.isFinite(rawMax) ? rawMax : null;
  const active = await resolveActiveMerchant(allMerchants);

  const banner = status === 'success' || status === 'cancelled' ? status : undefined;
  return (
    <BillingView
      plans={resolved}
      credits={credits}
      status={banner}
      shopCount={shopCount}
      maxShops={maxShops}
      hasActiveSubscription={resolved.hasActiveSubscription}
      workspaces={activeMerchants.map((m) => ({ id: m.id, name: m.name }))}
      activeMerchantId={active?.id}
      canManageBilling={active?.isAccountOwner ?? false}
    />
  );
}
