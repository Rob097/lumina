import Link from 'next/link';
import type { ClientWithStats, CreditsResponse, GenerationSummary } from '@lumina/shared';
import { Icon } from '@/components/ui/Icon';
import { compact } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { StudioRenderGrid } from './StudioRenderGrid';
import { clientInitials, contactLine } from './client-format';

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="studio-stat">
      <span className="studio-stat-label">
        <Icon name={icon} size={15} strokeWidth={1.8} />
        {label}
      </span>
      <span className="studio-stat-value tnum">{value}</span>
    </div>
  );
}

/** Studio Overview — the concise dashboard: a CTA, headline stats, recent renders, recent clients. */
export function StudioOverview({
  clients,
  recent,
  credits,
}: {
  clients: ClientWithStats[];
  recent: GenerationSummary[];
  credits: CreditsResponse | null;
}) {
  const totalRenders = clients.reduce((sum, c) => sum + c.generationCount, 0);
  const topClients = clients.slice(0, 5);

  return (
    <div className="studio-overview">
      <div className="card studio-hero">
        <div className="studio-hero-copy">
          <h2>Studio</h2>
          <p className="sub">
            Create a visualization of your product on a walk-in client&apos;s photo, then email or print it.
          </p>
        </div>
        <Link href="/studio/new" className="btn btn-primary">
          New visualization
        </Link>
      </div>

      <div className="studio-stats">
        <Stat icon="overview" label="Clients" value={compact(clients.length)} />
        <Stat icon="generations" label="Client renders" value={compact(totalRenders)} />
        <Stat icon="billing" label="Credits left" value={credits ? compact(credits.balance) : '—'} />
      </div>

      <div className="studio-cols">
        <section className="card studio-panel">
          <div className="card-head">
            <h3>Recent renders</h3>
            <Link href="/studio/new" className="studio-link">
              New →
            </Link>
          </div>
          <div className="card-pad">
            <StudioRenderGrid
              initial={recent}
              empty={{
                title: 'No renders yet',
                body: 'Your first Studio visualization will appear here.',
              }}
            />
          </div>
        </section>

        <section className="card studio-panel">
          <div className="card-head">
            <h3>Recent clients</h3>
            <Link href="/studio/clients" className="studio-link">
              All clients →
            </Link>
          </div>
          <div className="card-pad">
            {topClients.length === 0 ? (
              <EmptyState
                icon="overview"
                title="No clients yet"
                body="Add a client to keep their visualizations on file."
              />
            ) : (
              <ul className="client-mini">
                {topClients.map((c) => (
                  <li key={c.id}>
                    <Link href={`/studio/clients/${c.id}`} className="client-mini-row">
                      <span className="avatar">{clientInitials(c.name)}</span>
                      <span className="client-mini-main">
                        <span className="client-mini-name">{c.name}</span>
                        <span className="client-mini-sub">{contactLine(c)}</span>
                      </span>
                      <span className="client-mini-count">
                        {c.generationCount} {c.generationCount === 1 ? 'render' : 'renders'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
