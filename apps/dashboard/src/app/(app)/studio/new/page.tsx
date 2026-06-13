import { fetchClients, fetchProducts } from '@/lib/api';
import { NewVisualization } from './NewVisualization';

export const dynamic = 'force-dynamic';

/**
 * New visualization (#8) — the Studio wizard. `?client=<id>` preselects a client (used by the
 * "New visualization for this client" CTA on the client detail page).
 */
export default async function NewVisualizationPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const [clients, list, sp] = await Promise.all([fetchClients(), fetchProducts(), searchParams]);
  const products = list.products.filter((p) => p.active);
  const preselectClientId = sp.client && clients.some((c) => c.id === sp.client) ? sp.client : null;
  return (
    <NewVisualization initialClients={clients} products={products} preselectClientId={preselectClientId} />
  );
}
