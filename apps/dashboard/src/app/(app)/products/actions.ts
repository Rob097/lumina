'use server';

import { revalidatePath } from 'next/cache';
import {
  ProductInputSchema,
  ProductUpdateSchema,
  type BulkProductsResult,
  type Product,
  type ProductInput,
} from '@lumina/shared';
import {
  archiveProduct,
  bulkUpsertProducts,
  createProduct,
  fetchProducts,
  updateProduct,
} from '@/lib/api';

export type MutateResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createProductAction(input: unknown): Promise<MutateResult<Product>> {
  const parsed = ProductInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Please fill in a name and a valid image URL.' };
  }
  const product = await createProduct(parsed.data);
  if (!product) {
    return { ok: false, error: "Couldn't create the product. Try again." };
  }
  revalidatePath('/products');
  return { ok: true, data: product };
}

export async function updateProductAction(
  id: string,
  patch: unknown,
): Promise<MutateResult<Product>> {
  const parsed = ProductUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: 'Those changes are invalid.' };
  }
  const product = await updateProduct(id, parsed.data);
  if (!product) {
    return { ok: false, error: "Couldn't save the product." };
  }
  revalidatePath('/products');
  return { ok: true, data: product };
}

export async function archiveProductAction(id: string): Promise<MutateResult<{ id: string }>> {
  const ok = await archiveProduct(id);
  if (!ok) {
    return { ok: false, error: "Couldn't archive the product." };
  }
  revalidatePath('/products');
  return { ok: true, data: { id } };
}

export async function importProductsAction(
  products: ProductInput[],
): Promise<MutateResult<{ result: BulkProductsResult; products: Product[] }>> {
  const parsed = ProductInputSchema.array().min(1).max(1000).safeParse(products);
  if (!parsed.success) {
    return { ok: false, error: 'The import had no valid rows.' };
  }
  const result = await bulkUpsertProducts(parsed.data);
  if (!result) {
    return { ok: false, error: 'The import failed. Try again.' };
  }
  revalidatePath('/products');
  const fresh = await fetchProducts();
  return { ok: true, data: { result, products: fresh.products } };
}
