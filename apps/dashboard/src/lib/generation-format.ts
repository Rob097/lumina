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

/** "11.0s" from a latency in ms, or null. */
export function latencyLabel(ms: number | null): string | null {
  if (ms === null) return null;
  return `${(ms / 1000).toFixed(1)}s`;
}
