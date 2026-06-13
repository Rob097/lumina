import { fetchClientsWithStats } from '@/lib/api';
import { ClientsView } from './ClientsView';

export const dynamic = 'force-dynamic';

/** Studio Clients (#8) — the navigable rubric. */
export default async function ClientsPage() {
  const clients = await fetchClientsWithStats();
  return <ClientsView initial={clients} />;
}
