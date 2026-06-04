import './products.css';
import { fetchProducts } from '@/lib/api';
import { ProductsManager } from './ProductsManager';

export default async function ProductsPage() {
  const { products } = await fetchProducts();
  return <ProductsManager initial={products} />;
}
