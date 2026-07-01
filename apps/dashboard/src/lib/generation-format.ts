import type { GenerationStatus } from '@lumina/shared';

/** Badge class + label for a generation status (presentation lookup). */
export function statusBadge(status: GenerationStatus): { cls: string; label: string } {
  switch (status) {
    case 'succeeded':
      return { cls: 'badge-success', label: 'Succeeded' };
    case 'failed':
      return { cls: 'badge-danger', label: 'Failed' };
    case 'refunded':
      return { cls: 'badge-warning', label: 'Refunded' };
    case 'processing':
      return { cls: 'badge-accent', label: 'Processing' };
    case 'queued':
    default:
      return { cls: 'badge', label: 'Queued' };
  }
}

/** "11.0s" from a latency in ms, or null. NOTE: this is only the compose model call, not the wall-clock. */
export function latencyLabel(ms: number | null): string | null {
  if (ms === null) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Total wall-clock time a generation took, from `createdAt` (queued) to `finishedAt` — the number a shopper
 * actually waits (queue + every attempt + post-processing), which the compose-only `latencyLabel` badly
 * understates (14s "latency" for a 7-minute run). Null while still running or for an inconsistent pair.
 */
export function totalTimeLabel(createdAt: string, finishedAt: string | null): string | null {
  if (!finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`;
}
