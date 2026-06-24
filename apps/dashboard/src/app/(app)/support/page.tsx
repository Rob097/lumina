import { fetchMe } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { SupportView } from './SupportView';

export default async function SupportPage() {
  const me = await fetchMe();
  if (!me) {
    return <EmptyState icon="support" title="No workspace" body="We couldn't load your account." />;
  }
  return <SupportView email={me.user.email} />;
}
