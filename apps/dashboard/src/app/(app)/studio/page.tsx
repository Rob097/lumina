import '../generations/generations.css';
import './studio.css';
import { fetchClients, fetchProducts } from '@/lib/api';
import { StudioView } from './StudioView';

export const dynamic = 'force-dynamic';

/**
 * Studio (#8) — the physical-store use case: generate a "try in your room" visualization in the
 * dashboard (no widget), optionally for a saved client, then email or download the result.
 */
export default async function StudioPage() {
  const [clients, list] = await Promise.all([fetchClients(), fetchProducts()]);
  const products = list.products.filter((p) => p.active);
  return <StudioView initialClients={clients} products={products} />;
}
