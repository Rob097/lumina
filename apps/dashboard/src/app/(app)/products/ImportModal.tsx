'use client';

import { useState, useTransition } from 'react';
import type { Product } from '@lumina/shared';
import { parseProductsCsv, type CsvParseResult } from '@/lib/csv';
import { importProductsAction } from './actions';

const SAMPLE = 'name,imageUrl,category,externalId\nAura Floor Lamp,https://shop.it/aura.png,lighting,AURA-01';

export function ImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (products: Product[]) => void;
}) {
  const [parsed, setParsed] = useState<CsvParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(file: File) {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setParsed(parseProductsCsv(String(reader.result ?? '')));
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
  }

  function runImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await importProductsAction(parsed.rows);
      if (res.ok) {
        onImported(res.data.products);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="drawer-head">
          <h3>Import products from CSV</h3>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="drawer-body">
          <p className="t-secondary import-p">
            Columns: <span className="code-inline">name</span>,{' '}
            <span className="code-inline">imageUrl</span> (or <span className="code-inline">image</span>),{' '}
            optional <span className="code-inline">category</span> &{' '}
            <span className="code-inline">externalId</span>. Rows are upserted by external ID.
          </p>

          <label className="import-drop">
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="26" height="26">
              <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
            </svg>
            <span>{fileName ? fileName : 'Choose a CSV file'}</span>
          </label>

          {parsed && (
            <div className="import-summary">
              <span className="badge badge-success">{parsed.rows.length} valid</span>
              {parsed.errors.length > 0 && (
                <span className="badge badge-warning">{parsed.errors.length} skipped</span>
              )}
            </div>
          )}

          {parsed && parsed.errors.length > 0 && (
            <ul className="import-errors">
              {parsed.errors.slice(0, 6).map((e) => (
                <li key={e.line}>
                  Line {e.line}: {e.message}
                </li>
              ))}
              {parsed.errors.length > 6 && <li>…and {parsed.errors.length - 6} more</li>}
            </ul>
          )}

          {!parsed && (
            <details className="import-sample">
              <summary>See an example</summary>
              <pre className="code-block">
                <code>{SAMPLE}</code>
              </pre>
            </details>
          )}

          {error && <p className="field-error">{error}</p>}
        </div>

        <footer className="drawer-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={pending || !parsed || parsed.rows.length === 0}
            onClick={runImport}
          >
            {pending ? 'Importing…' : parsed ? `Import ${parsed.rows.length}` : 'Import'}
          </button>
        </footer>
      </div>
    </div>
  );
}
