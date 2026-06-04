import './billing.css';
import { fetchBillingPlans, fetchCredits } from '@/lib/api';
import { PLAN_CATALOG, buildBillingPlans } from '@lumina/shared';
import { EmptyState } from '@/components/ui/EmptyState';
import { BillingView } from './BillingView';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ status }, plans, credits] = await Promise.all([
    searchParams,
    fetchBillingPlans(),
    fetchCredits(),
  ]);

  // Plans come from the API; if billing isn't wired yet, fall back to the static catalog (free tier).
  const resolved = plans ?? buildBillingPlans('free');
  if (!resolved.plans.length || !PLAN_CATALOG) {
    return <EmptyState icon="billing" title="Billing unavailable" body="Try again in a moment." />;
  }

  const banner = status === 'success' || status === 'cancelled' ? status : undefined;
  return <BillingView plans={resolved} credits={credits} status={banner} />;
}
