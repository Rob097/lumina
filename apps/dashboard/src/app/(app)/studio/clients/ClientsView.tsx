'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import type { Client, ClientWithStats } from '@lumina/shared';
import { shortDate } from '@/lib/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { deleteStudioClientAction } from '@/lib/studio-actions';
import { ClientDrawer } from './ClientDrawer';
import { clientInitials, contactLine } from '../client-format';

/** The client rubric (#8) — searchable list of walk-in clients with render count + last activity. */
export function ClientsView({ initial }: { initial: ClientWithStats[] }) {
  const [rows, setRows] = useState<ClientWithStats[]>(initial);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState<{ open: boolean; client: ClientWithStats | null }>({
    open: false,
    client: null,
  });
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  function onSaved(saved: Client): void {
    setRows((prev) => {
      if (!prev.some((r) => r.id === saved.id)) {
        return [{ ...saved, generationCount: 0, lastGenerationAt: null }, ...prev];
      }
      return prev.map((r) => (r.id === saved.id ? { ...r, ...saved } : r));
    });
    setDrawer({ open: false, client: null });
  }

  function remove(client: ClientWithStats): void {
    if (!window.confirm(`Delete ${client.name}? Their renders stay on file but lose the link.`)) return;
    startTransition(async () => {
      const ok = await deleteStudioClientAction(client.id);
      if (ok) setRows((prev) => prev.filter((r) => r.id !== client.id));
    });
  }

  return (
    <div className="studio-clients">
      <div className="studio-toolbar">
        <input
          className="input studio-search"
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="grow" />
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={() => setDrawer({ open: true, client: null })}
        >
          Add client
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="overview"
          title="No clients yet"
          body="Add a walk-in client to email or keep their visualizations on file."
          action={
            <button
              className="btn btn-primary btn-sm"
              type="button"
              onClick={() => setDrawer({ open: true, client: null })}
            >
              Add client
            </button>
          }
        />
      ) : (
        <div className="card">
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Renders</th>
                  <th>Last activity</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/studio/clients/${c.id}`} className="client-cell">
                        <span className="avatar">{clientInitials(c.name)}</span>
                        <span className="table-cell-strong">{c.name}</span>
                      </Link>
                    </td>
                    <td className="t-muted text-sm">{contactLine(c)}</td>
                    <td className="tnum">{c.generationCount}</td>
                    <td className="t-muted text-sm">
                      {c.lastGenerationAt ? shortDate(new Date(c.lastGenerationAt)) : '—'}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => setDrawer({ open: true, client: c })}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost btn-sm danger"
                          type="button"
                          onClick={() => remove(c)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <p className="studio-noresults">No clients match your search.</p>}
        </div>
      )}

      {drawer.open && (
        <ClientDrawer
          client={drawer.client}
          onClose={() => setDrawer({ open: false, client: null })}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
