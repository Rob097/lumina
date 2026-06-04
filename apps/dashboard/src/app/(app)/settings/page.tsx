import './settings.css';
import { fetchDomains, fetchKeys, fetchMe, fetchTeam } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { SettingsView } from './SettingsView';

export default async function SettingsPage() {
  const [me, keys, domains, team] = await Promise.all([
    fetchMe(),
    fetchKeys(),
    fetchDomains(),
    fetchTeam(),
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
    />
  );
}
