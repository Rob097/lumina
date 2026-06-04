'use client';

import { useState } from 'react';

/** Copy-to-clipboard button with a transient "Copied" confirmation. */
export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm ${className ?? ''}`}
      onClick={copy}
      aria-live="polite"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
