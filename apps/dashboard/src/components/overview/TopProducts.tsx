import type { TopProduct } from '@lumina/shared';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { compact, pct } from '@/lib/format';

export function TopProducts({ products }: { products: TopProduct[] }) {
  const max = products[0]?.generations ?? 0;
  return (
    <div className="card">
      <div className="card-head">
        <h3>Top-performing products</h3>
      </div>
      <div className="card-pad" style={{ paddingTop: 6, paddingBottom: 10 }}>
        {products.length === 0 ? (
          <EmptyState
            icon="products"
            title="No product performance yet"
            body="Once shoppers start generating, your best-performing products show up here."
          />
        ) : (
          products.map((p) => (
            <div key={p.id} className="prod-row">
              <span className="prod-thumb">
                <Icon name="products" size={18} strokeWidth={1.6} />
              </span>
              <div className="meta">
                <div className="nm">{p.name}</div>
                <div className="ct">
                  {p.category} · {pct(p.successRate)} success
                </div>
              </div>
              <div className="minibar">
                <i style={{ width: `${max > 0 ? Math.round((p.generations / max) * 100) : 0}%` }} />
              </div>
              <div className="gen tnum">{compact(p.generations)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
