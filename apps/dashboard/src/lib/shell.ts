/** Pure helpers for the app shell (sidebar / topbar). */

export type CreditLevel = 'ok' | 'warn' | 'danger';

/** Two-letter initials for an avatar / merchant logo. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Credit usage for the sidebar pill + meter. */
export function creditMeter(balance: number, included: number): { usedPct: number; level: CreditLevel } {
  const used = Math.max(0, included - balance);
  const usedPct = included > 0 ? Math.min(100, Math.round((used / included) * 100)) : 0;
  const level: CreditLevel = usedPct >= 90 ? 'danger' : usedPct >= 70 ? 'warn' : 'ok';
  return { usedPct, level };
}
