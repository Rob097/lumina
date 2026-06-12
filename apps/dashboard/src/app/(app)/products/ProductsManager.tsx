'use client';

import { useMemo, useState, useTransition } from 'react';
import { PRODUCT_CATEGORIES, type Product, type ProductCategory } from '@lumina/shared';
import { categoryLabel } from '@/lib/product-format';
import { shortDate } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductThumb } from '@/components/ui/ProductThumb';
import { ProductDrawer } from './ProductDrawer';
import { ImportModal } from './ImportModal';
import { archiveProductAction } from './actions';

export function ProductsManager({ initial }: { initial: Product[] }) {
  const [rows, setRows] = useState<Product[]>(initial);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ProductCategory | 'all'>('all');
  const [drawer, setDrawer] = useState<{ open: boolean; product: Product | null }>({
    open: false,
    product: null,
  });
  const [importing, setImporting] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (p) =>
        (category === 'all' || p.category === category) &&
        (q === '' || p.name.toLowerCase().includes(q) || (p.externalId ?? '').toLowerCase().includes(q)),
    );
  }, [rows, search, category]);

  function upsertRow(p: Product) {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === p.id);
      if (i === -1) return [p, ...prev];
      const next = [...prev];
      next[i] = p;
      return next;
    });
    setDrawer({ open: false, product: null });
  }

  function archive(id: string) {
    startTransition(async () => {
      const res = await archiveProductAction(id);
      if (res.ok) setRows((prev) => prev.filter((r) => r.id !== id));
    });
  }

  return (
    <div className="products">
      <div className="products-toolbar">
        <div className="search-field">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="16" height="16">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            className="input"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="select"
          value={category}
          onChange={(e) => setCategory(e.target.value as ProductCategory | 'all')}
        >
          <option value="all">All categories</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <div className="grow" />
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => setImporting(true)}>
          Import CSV
        </button>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => setDrawer({ open: true, product: null })}
        >
          Add product
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="products"
          title="No products yet"
          body="Add a product or import your catalog so shoppers have something to try on."
        />
      ) : (
        <div className="card products-card">
          <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>External ID</th>
                <th>Added</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="prod-cell">
                      <ProductThumb src={p.imageUrl} />
                      <span className="table-cell-strong">{p.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge">{categoryLabel(p.category)}</span>
                  </td>
                  <td className="mono text-sm t-muted">{p.externalId ?? '—'}</td>
                  <td className="t-muted text-sm">{shortDate(new Date(p.createdAt))}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        type="button"
                        onClick={() => setDrawer({ open: true, product: p })}
                      >
                        Edit
                      </button>
                      <button className="btn btn-ghost btn-sm danger" type="button" onClick={() => archive(p.id)}>
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {filtered.length === 0 && <p className="products-noresults">No products match your filters.</p>}
        </div>
      )}

      {drawer.open && (
        <ProductDrawer
          product={drawer.product}
          onClose={() => setDrawer({ open: false, product: null })}
          onSaved={upsertRow}
        />
      )}
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onImported={(products) => {
            setRows(products);
            setImporting(false);
          }}
        />
      )}
    </div>
  );
}
