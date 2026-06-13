import type { Client } from '@lumina/shared';

/** Up-to-two-letter monogram for a client avatar ("Mara Rossi" → "MR"). */
export function clientInitials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return letters || '?';
}

/** Best available contact line for a client, or a muted placeholder. */
export function contactLine(client: Pick<Client, 'email' | 'phone'>): string {
  return client.email ?? client.phone ?? 'No contact details';
}
