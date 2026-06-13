import { notFound } from 'next/navigation';
import { fetchClient, fetchGenerations } from '@/lib/api';
import { ClientDetail } from './ClientDetail';

export const dynamic = 'force-dynamic';

/** Studio client detail (#8) — contact, notes, and the client's render history. */
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await fetchClient(id);
  if (!client) {
    notFound();
  }
  const gens = await fetchGenerations({ clientId: id, limit: '12' });
  return <ClientDetail client={client} initialRenders={gens.items} initialCursor={gens.nextCursor} />;
}
