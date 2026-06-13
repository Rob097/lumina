'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Client, GenerationSummary } from '@lumina/shared';
import { loadClientGenerationsAction } from '@/lib/studio-actions';
import { StudioRenderGrid } from '../../StudioRenderGrid';
import { clientInitials } from '../../client-format';
import { ClientDrawer } from '../ClientDrawer';

export function ClientDetail({
  client: initialClient,
  initialRenders,
  initialCursor,
}: {
  client: Client;
  initialRenders: GenerationSummary[];
  initialCursor: string | null;
}) {
  const [client, setClient] = useState<Client>(initialClient);
  const [editing, setEditing] = useState(false);

  return (
    <div className="client-detail">
      <Link href="/studio/clients" className="studio-back">
        ← All clients
      </Link>

      <div className="card client-header">
        <span className="avatar avatar-lg">{clientInitials(client.name)}</span>
        <div className="client-header-main">
          <h2>{client.name}</h2>
          <div className="client-contacts">
            {client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : null}
            {client.phone ? <span>{client.phone}</span> : null}
            {!client.email && !client.phone ? (
              <span className="t-muted">No contact details</span>
            ) : null}
          </div>
        </div>
        <div className="client-header-actions">
          <Link className="btn btn-primary" href={`/studio/new?client=${client.id}`}>
            New visualization
          </Link>
          <button className="btn btn-ghost" type="button" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
      </div>

      {client.notes ? (
        <div className="card client-notes">
          <span className="studio-label">Notes</span>
          <p>{client.notes}</p>
        </div>
      ) : null}

      <section className="client-renders">
        <h3>Visualizations</h3>
        <StudioRenderGrid
          initial={initialRenders}
          initialCursor={initialCursor}
          loadMore={(cursor) => loadClientGenerationsAction(client.id, cursor)}
          empty={{
            title: 'No visualizations yet',
            body: 'Start one with “New visualization”.',
          }}
        />
      </section>

      {editing && (
        <ClientDrawer
          client={{ ...client, generationCount: 0, lastGenerationAt: null }}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setClient(saved);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
