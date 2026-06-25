import { parseSupportPrefill } from '@lumina/shared';
import { fetchMe } from '@/lib/api';
import { EmptyState } from '@/components/ui/EmptyState';
import { SupportView } from './SupportView';

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string | string[]; subject?: string | string[] }>;
}) {
  const me = await fetchMe();
  if (!me) {
    return <EmptyState icon="support" title="No workspace" body="We couldn't load your account." />;
  }
  const prefill = parseSupportPrefill(await searchParams);
  return (
    <SupportView
      email={me.user.email}
      initialCategory={prefill.category}
      initialSubject={prefill.subject}
    />
  );
}
