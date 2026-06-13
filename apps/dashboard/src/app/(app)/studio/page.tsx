import { fetchClientsWithStats, fetchCredits, fetchGenerations } from '@/lib/api';
import { StudioOverview } from './StudioOverview';

export const dynamic = 'force-dynamic';

/** Studio Overview (#8) — the section's concise dashboard. */
export default async function StudioPage() {
  const [clients, recent, credits] = await Promise.all([
    fetchClientsWithStats(),
    fetchGenerations({ source: 'studio', limit: '8' }),
    fetchCredits(),
  ]);
  return <StudioOverview clients={clients} recent={recent.items} credits={credits} />;
}
