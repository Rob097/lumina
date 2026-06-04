'use client';

import { useState, useTransition } from 'react';
import { PRODUCT_CATEGORIES, type Product, type ProductCategory, type ProductInput } from '@lumina/shared';
import { categoryLabel } from '@/lib/product-format';
import { createProductAction, updateProductAction } from './actions';

interface FormState {
  name: string;
  imageUrl: string;
  category: ProductCategory;
  externalId: string;
  w: string;
  h: string;
  d: string;
  unit: 'cm' | 'in';
}

function fromProduct(p: Product | null): FormState {
  return {
    name: p?.name ?? '',
    imageUrl: p?.imageUrl ?? '',
    category: p?.category ?? 'other',
    externalId: p?.externalId ?? '',
    w: p?.dimensions?.w?.toString() ?? '',
    h: p?.dimensions?.h?.toString() ?? '',
    d: p?.dimensions?.d?.toString() ?? '',
    unit: p?.dimensions?.unit ?? 'cm',
  };
}

function buildInput(s: FormState): ProductInput {
  const dims: Record<string, number | string> = {};
  if (s.w) dims.w = Number(s.w);
  if (s.h) dims.h = Number(s.h);
  if (s.d) dims.d = Number(s.d);
  const hasDims = s.w || s.h || s.d;
  return {
    name: s.name.trim(),
    imageUrl: s.imageUrl.trim(),
    category: s.category,
    ...(s.externalId.trim() ? { externalId: s.externalId.trim() } : {}),
    ...(hasDims ? { dimensions: { ...dims, unit: s.unit } } : {}),
  } as ProductInput;
}

export function ProductDrawer({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const isEdit = product !== null;
  const [s, setS] = useState<FormState>(fromProduct(product));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (p: Partial<FormState>) => setS((prev) => ({ ...prev, ...p }));

  function submit() {
    setError(null);
    const input = buildInput(s);
    startTransition(async () => {
      const res = isEdit
        ? await updateProductAction(product.id, input)
        : await createProductAction(input);
      if (res.ok) {
        onSaved(res.data);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="drawer-head">
          <h3>{isEdit ? 'Edit product' : 'Add product'}</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="drawer-body">
          <label className="field">
            <span className="field-label">Name</span>
            <input className="input" value={s.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Image URL</span>
            <input
              className="input mono text-sm"
              placeholder="https://…"
              value={s.imageUrl}
              onChange={(e) => set({ imageUrl: e.target.value })}
            />
          </label>
          {s.imageUrl.trim() && (
            <img className="drawer-preview" src={s.imageUrl} alt="" />
          )}
          <div className="field-row">
            <label className="field">
              <span className="field-label">Category</span>
              <select
                className="select"
                value={s.category}
                onChange={(e) => set({ category: e.target.value as ProductCategory })}
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">External ID / SKU</span>
              <input
                className="input"
                value={s.externalId}
                onChange={(e) => set({ externalId: e.target.value })}
              />
            </label>
          </div>

          <span className="field-label">Dimensions (optional)</span>
          <div className="dims-row">
            <input className="input" placeholder="W" value={s.w} onChange={(e) => set({ w: e.target.value })} />
            <input className="input" placeholder="H" value={s.h} onChange={(e) => set({ h: e.target.value })} />
            <input className="input" placeholder="D" value={s.d} onChange={(e) => set({ d: e.target.value })} />
            <select
              className="select"
              value={s.unit}
              onChange={(e) => set({ unit: e.target.value as 'cm' | 'in' })}
            >
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
          </div>

          {error && <p className="field-error">{error}</p>}
        </div>

        <footer className="drawer-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={pending || !s.name.trim() || !s.imageUrl.trim()}
            onClick={submit}
          >
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add product'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
