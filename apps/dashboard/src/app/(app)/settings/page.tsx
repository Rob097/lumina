import './settings.css';
import { DEFAULT_NOTIFICATION_PREFS } from '@lumina/shared';
import {
  fetchDomains,
  fetchInvitations,
  fetchKeys,
  fetchMe,
  fetchNotificationPrefs,
  fetchTeam,
} from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { resolveActiveMerchant } from '@/lib/workspace';
import { SettingsView } from './SettingsView';

export default async function SettingsPage() {
  const [me, keys, domains, team, invitations, notificationPrefs] = await Promise.all([
    fetchMe(),
    fetchKeys(),
    fetchDomains(),
    fetchTeam(),
    fetchInvitations(),
    fetchNotificationPrefs(),
  ]);

  const merchant = me ? await resolveActiveMerchant(me.merchants) : undefined;
  if (!me || !merchant) {
    return <EmptyState icon="settings" title="No workspace" body="We couldn't load your account." />;
  }

  return (
    <SettingsView
      merchantName={merchant.name}
      slug={merchant.slug}
      email={me.user.email}
      plan={merchant.plan}
      keys={keys}
      domains={domains}
      team={team}
      invitations={invitations}
      canInvite={merchant.role !== 'member'}
      notificationPrefs={notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS}
    />
  );
}
