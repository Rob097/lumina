'use client';

import { useState, useTransition } from 'react';
import type { Client, ClientInput, ClientWithStats } from '@lumina/shared';
import { createStudioClientAction, updateStudioClientAction } from '@/lib/studio-actions';

interface FormState {
  name: string;
  email: string;
  phone: string;
  notes: string;
}

function buildInput(s: FormState): ClientInput {
  return {
    name: s.name.trim(),
    ...(s.email.trim() ? { email: s.email.trim() } : {}),
    ...(s.phone.trim() ? { phone: s.phone.trim() } : {}),
    ...(s.notes.trim() ? { notes: s.notes.trim() } : {}),
  };
}

/** Add / edit a Studio client. Returns the saved record to the parent for an in-place list update. */
export function ClientDrawer({
  client,
  onClose,
  onSaved,
}: {
  client: ClientWithStats | null;
  onClose: () => void;
  onSaved: (c: Client) => void;
}) {
  const isEdit = client !== null;
  const [s, setS] = useState<FormState>({
    name: client?.name ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    notes: client?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (p: Partial<FormState>) => setS((prev) => ({ ...prev, ...p }));

  function submit() {
    if (!s.name.trim()) {
      setError('A name is required.');
      return;
    }
    setError(null);
    const input = buildInput(s);
    startTransition(async () => {
      const saved = isEdit
        ? await updateStudioClientAction(client.id, input)
        : await createStudioClientAction(input);
      if (saved) {
        onSaved(saved);
      } else {
        setError('Could not save the client. Please try again.');
      }
    });
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="drawer-head">
          <h3>{isEdit ? 'Edit client' : 'Add client'}</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="drawer-body">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="input"
              value={s.name}
              placeholder="Full name"
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              placeholder="name@example.com"
              value={s.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Phone</span>
            <input
              className="input"
              placeholder="+39 …"
              value={s.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Notes</span>
            <textarea
              className="input"
              rows={3}
              placeholder="Preferences, room details, follow-ups…"
              value={s.notes}
              onChange={(e) => set({ notes: e.target.value })}
            />
          </label>

          {error && <p className="field-error">{error}</p>}
        </div>

        <footer className="drawer-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={pending || !s.name.trim()}
            onClick={submit}
          >
            {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Add client'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
