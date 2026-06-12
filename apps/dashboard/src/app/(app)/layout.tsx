import './overlay.css';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { PLAN_CATALOG } from '@lumina/shared';
import { bootstrapMerchant, fetchCredits, fetchMe, fetchNotifications } from '@/lib/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/shell/Sidebar';
import { Topbar } from '@/components/shell/Topbar';
import { creditMeter, initials } from '@/lib/shell';

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
  const [me, credits, notifications] = await Promise.all([
    fetchMe(),
    fetchCredits(),
    fetchNotifications(),
  ]);
  const merchant = me?.merchants[0];

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
          initials: initials(merchant?.name ?? 'LU'),
        }}
        credits={{ balance, usedPct: meter.usedPct, level: meter.level }}
        account={{ name: accountName, email, initials: initials(accountName) }}
      />
      <div className="main">
        <Topbar accountInitials={initials(accountName)} notifications={notifications} />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
