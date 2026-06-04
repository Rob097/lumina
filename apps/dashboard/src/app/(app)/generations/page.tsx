import './generations.css';
import { fetchGenerations } from '@/lib/api';
import { GenerationsGallery } from './GenerationsGallery';

export default async function GenerationsPage() {
  const { items, nextCursor } = await fetchGenerations();
  return <GenerationsGallery initial={items} initialCursor={nextCursor} />;
}
