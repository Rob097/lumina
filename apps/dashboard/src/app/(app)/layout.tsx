import './overlay.css';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PLAN_CATALOG, canUseAnalytics } from '@lumina/shared';
import {
  bootstrapMerchant,
  fetchCredits,
  fetchGenerations,
  fetchMe,
  fetchNotifications,
  fetchProducts,
} from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { creditMeter, initials } from '@/lib/shell';
import { resolveActiveMerchant } from '@/lib/workspace';

/**
 * Authed app shell: gates the session, provisions the merchant on first login, and renders the
 * sidebar + topbar around every dashboard page.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect('/login');
  }

  await bootstrapMerchant();
  const [me, credits, notifications, products, generations] = await Promise.all([
    fetchMe(),
    fetchCredits(),
    fetchNotifications(),
    fetchProducts(),
    fetchGenerations({ limit: '1' }),
  ]);
  const merchants = me?.merchants ?? [];
  const merchant = await resolveActiveMerchant(merchants);

  const balance = credits?.balance ?? merchant?.creditsBalance ?? 0;
  const included = credits?.included ?? (merchant ? PLAN_CATALOG[merchant.plan].includedCredits : 0);
  const meter = creditMeter(balance, included);

  const email = me?.user.email ?? data.user.email ?? '';
  const accountName = email.split('@')[0] || 'Account';

  return (
    <div className="app">
      <Sidebar
        merchant={{
          name: merchant?.name ?? 'Your store',
          plan: merchant ? PLAN_CATALOG[merchant.plan].label : 'Free',
          initials: initials(merchant?.name ?? 'YV'),
        }}
        workspaces={merchants.map((m) => ({
          id: m.id,
          name: m.name,
          plan: PLAN_CATALOG[m.plan].label,
          initials: initials(m.name),
          suspended: m.suspended,
        }))}
        activeMerchantId={merchant?.id ?? ''}
        credits={{ balance, included, usedPct: meter.usedPct, level: meter.level }}
        account={{ name: accountName, email, initials: initials(accountName) }}
        counts={{ products: products.total, generations: generations.total }}
        analyticsEnabled={merchant ? canUseAnalytics(merchant.plan) : false}
      />
      <div className="main">
        <Topbar accountInitials={initials(accountName)} notifications={notifications} />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
