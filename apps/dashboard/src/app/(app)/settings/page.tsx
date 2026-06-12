import './settings.css';
import { DEFAULT_NOTIFICATION_PREFS } from '@lumina/shared';
import { fetchDomains, fetchKeys, fetchMe, fetchNotificationPrefs, fetchTeam } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { SettingsView } from './SettingsView';

export default async function SettingsPage() {
  const [me, keys, domains, team, notificationPrefs] = await Promise.all([
    fetchMe(),
    fetchKeys(),
    fetchDomains(),
    fetchTeam(),
    fetchNotificationPrefs(),
  ]);

  const merchant = me?.merchants[0];
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
      notificationPrefs={notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS}
    />
  );
}
