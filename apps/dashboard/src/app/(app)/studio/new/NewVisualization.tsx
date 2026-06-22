'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { MAX_PRODUCTS_PER_GENERATION, type Client, type Product } from '@lumina/shared';
import { Icon } from '@/components/ui/Icon';
import { BeforeAfter } from '../../generations/BeforeAfter';
import {
  createStudioClientAction,
  emailStudioResultAction,
  pollStudioGenerationAction,
  signStudioUploadAction,
  startStudioGenerationAction,
} from '@/lib/studio-actions';

type Phase = 'compose' | 'generating' | 'result';

interface RoomFile {
  roomKey: string;
  previewUrl: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function mapError(code: string): string {
  if (code === 'insufficient_credits') return "You're out of credits — top up to keep generating.";
  if (code === 'not_found') return 'That product could not be found.';
  return 'The visualization failed. Your credit was refunded.';
}

export function NewVisualization({
  initialClients,
  products,
  preselectClientId,
}: {
  initialClients: Client[];
  products: Product[];
  preselectClientId: string | null;
}) {
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [clientId, setClientId] = useState<string>(preselectClientId ?? '');
  const [productIds, setProductIds] = useState<string[]>(products[0] ? [products[0].id] : []);
  const [room, setRoom] = useState<RoomFile | null>(null);
  const [uploading, setUploading] = useState(false);

  const [phase, setPhase] = useState<Phase>('compose');
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [result, setResult] = useState<{
    resultUrl: string | null;
    roomUrl: string | null;
    suggestedQuantity: number | null;
    quantityRationale: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showNewClient, setShowNewClient] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', phone: '' });
  const [savingClient, setSavingClient] = useState(false);

  const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedClient = clients.find((c) => c.id === clientId) ?? null;
  const atProductCap = productIds.length >= MAX_PRODUCTS_PER_GENERATION;
  const canGenerate = Boolean(productIds.length > 0 && room && !uploading);

  // Toggle a product in/out of the set, preserving click order (it feeds placement order), capped at the max.
  function toggleProduct(id: string): void {
    setProductIds((cur) =>
      cur.includes(id)
        ? cur.filter((p) => p !== id)
        : cur.length < MAX_PRODUCTS_PER_GENERATION
          ? [...cur, id]
          : cur,
    );
  }

  async function onPickFile(file: File): Promise<void> {
    setError(null);
    setUploading(true);
    try {
      const signed = await signStudioUploadAction(file.type || 'image/jpeg');
      if (!signed) {
        setError('Could not start the upload. Please try again.');
        return;
      }
      const put = await fetch(signed.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type || 'image/jpeg' },
      });
      if (!put.ok) {
        setError('The photo failed to upload. Please try again.');
        return;
      }
      setRoom({ roomKey: signed.roomKey, previewUrl: URL.createObjectURL(file) });
    } finally {
      setUploading(false);
    }
  }

  async function onCreateClient(): Promise<void> {
    if (!draft.name.trim()) return;
    setSavingClient(true);
    try {
      const created = await createStudioClientAction({
        name: draft.name.trim(),
        ...(draft.email.trim() ? { email: draft.email.trim() } : {}),
        ...(draft.phone.trim() ? { phone: draft.phone.trim() } : {}),
      });
      if (created) {
        setClients((cs) => [created, ...cs]);
        setClientId(created.id);
        setShowNewClient(false);
        setDraft({ name: '', email: '', phone: '' });
      }
    } finally {
      setSavingClient(false);
    }
  }

  async function onGenerate(): Promise<void> {
    if (!room || productIds.length === 0) return;
    setPhase('generating');
    setError(null);
    setResult(null);
    setEmailState('idle');
    const res = await startStudioGenerationAction({
      productIds,
      roomKey: room.roomKey,
      ...(clientId ? { clientId } : {}),
    });
    if ('error' in res) {
      setError(mapError(res.error));
      setPhase('compose');
      return;
    }
    setGenerationId(res.generationId);
    for (let i = 0; i < 150; i += 1) {
      await sleep(2000);
      const detail = await pollStudioGenerationAction(res.generationId);
      if (!detail) continue;
      if (detail.status === 'succeeded') {
        setResult({
          resultUrl: detail.resultUrl ?? null,
          roomUrl: detail.roomUrl ?? null,
          suggestedQuantity: detail.suggestedQuantity ?? null,
          quantityRationale: detail.quantityRationale ?? null,
        });
        setPhase('result');
        return;
      }
      if (detail.status === 'failed' || detail.status === 'refunded') {
        setError('The visualization failed. Your credit was refunded.');
        setPhase('compose');
        return;
      }
    }
    setError('This is taking longer than expected — check Generations in a moment.');
    setPhase('compose');
  }

  async function onEmail(): Promise<void> {
    if (!generationId) return;
    setEmailState('sending');
    setEmailMsg(null);
    const r = await emailStudioResultAction(generationId);
    if (r.ok) {
      setEmailState('sent');
    } else {
      setEmailState('error');
      setEmailMsg(r.message);
    }
  }

  function onReset(): void {
    setRoom(null);
    setResult(null);
    setGenerationId(null);
    setPhase('compose');
    setError(null);
    setEmailState('idle');
    if (fileRef.current) fileRef.current.value = '';
  }

  if (phase === 'result') {
    return (
      <div className="card studio-result">
        <div className="studio-head">
          <h2>Your visualization</h2>
          {selectedClient ? <p className="sub">For {selectedClient.name}</p> : null}
        </div>
        <BeforeAfter beforeUrl={result?.roomUrl ?? null} afterUrl={result?.resultUrl ?? null} />
        {result?.suggestedQuantity ? (
          <div className="studio-quantity" role="note">
            <span className="studio-quantity-badge">≈ {result.suggestedQuantity} pcs</span>
            <span className="studio-quantity-text">
              estimated to cover the surface
              {result.quantityRationale ? <em> — {result.quantityRationale}</em> : null}
            </span>
          </div>
        ) : null}
        <div className="studio-actions">
          {result?.resultUrl ? (
            <a className="btn" href={result.resultUrl} target="_blank" rel="noreferrer" download>
              Download
            </a>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={emailState === 'sending' || emailState === 'sent'}
            onClick={onEmail}
          >
            {emailState === 'sent' ? '✓ Emailed' : emailState === 'sending' ? 'Sending…' : 'Email to client'}
          </button>
          {selectedClient ? (
            <Link className="btn btn-ghost" href={`/studio/clients/${selectedClient.id}`}>
              View client
            </Link>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onReset}>
            New render
          </button>
        </div>
        {emailState === 'error' ? <p className="studio-error">{emailMsg}</p> : null}
        {emailState === 'sent' ? (
          <p className="studio-hint">Sent to {selectedClient?.email ?? 'the client'}.</p>
        ) : null}
        {!selectedClient?.email && emailState === 'idle' ? (
          <p className="studio-hint">
            Tip: link a client with an email (or save one) to enable “Email to client”.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="card studio-compose">
      <div className="studio-head">
        <h2>New visualization</h2>
        <p className="sub">Generate a “try in your room” preview for a walk-in client.</p>
      </div>

      {/* Client */}
      <div className="studio-field">
        <label className="studio-label">Client (optional)</label>
        <div className="studio-client-row">
          <select
            className="input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={showNewClient}
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.email ? ` · ${c.email}` : ''}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ghost" onClick={() => setShowNewClient((v) => !v)}>
            {showNewClient ? 'Cancel' : '+ New client'}
          </button>
        </div>
        {showNewClient ? (
          <div className="studio-newclient">
            <input
              className="input"
              placeholder="Name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            <input
              className="input"
              placeholder="Email (optional)"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
            <input
              className="input"
              placeholder="Phone (optional)"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={!draft.name.trim() || savingClient}
              onClick={onCreateClient}
            >
              {savingClient ? 'Saving…' : 'Save client'}
            </button>
          </div>
        ) : null}
      </div>

      {/* Products — select one or more to place together in a single render */}
      <div className="studio-field">
        <label className="studio-label">Products</label>
        {products.length === 0 ? (
          <p className="studio-empty">
            No products yet. Add one in <Link href="/products">Products</Link> first.
          </p>
        ) : (
          <>
            <div className="studio-product-list" role="group" aria-label="Products to place">
              {products.map((p) => {
                const order = productIds.indexOf(p.id);
                const selected = order !== -1;
                return (
                  <label
                    key={p.id}
                    className={`studio-product-option${selected ? ' is-selected' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!selected && atProductCap}
                      onChange={() => toggleProduct(p.id)}
                    />
                    <span className="studio-product-name">{p.name}</span>
                    {selected ? <span className="studio-product-order">{order + 1}</span> : null}
                  </label>
                );
              })}
            </div>
            <p className="studio-hint">
              {productIds.length > 1
                ? `${productIds.length} products will be placed together in one render.`
                : `Select up to ${MAX_PRODUCTS_PER_GENERATION} products to place together in one render.`}
            </p>
          </>
        )}
      </div>

      {/* Room photo */}
      <div className="studio-field">
        <label className="studio-label">Room photo</label>
        {room ? (
          <div className="studio-room">
            <img src={room.previewUrl} alt="Room" className="studio-room-img" />
            <button type="button" className="btn btn-ghost" onClick={() => setRoom(null)}>
              Choose another
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="studio-drop"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Icon name="generations" size={22} />
            <span>{uploading ? 'Uploading…' : 'Upload a room photo'}</span>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPickFile(f);
          }}
        />
      </div>

      {error ? <p className="studio-error">{error}</p> : null}

      <button
        type="button"
        className="btn btn-primary studio-generate"
        disabled={!canGenerate || phase === 'generating'}
        onClick={onGenerate}
      >
        {phase === 'generating' ? 'Generating…' : 'Generate visualization'}
      </button>
      {phase === 'generating' ? <p className="studio-hint">This usually takes 1–2 minutes.</p> : null}
    </div>
  );
}
