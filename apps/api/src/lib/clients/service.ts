import { and, desc, eq } from 'drizzle-orm';
import { clients, type Database } from '@lumina/db';
import type { Client, ClientInput, ClientUpdate } from '@lumina/shared';

/**
 * Studio clients (#8). Every query is scoped by `merchant_id` (HARD RULE #1) — RLS on the table is a
 * second line of defense for the dashboard (`authenticated`) path.
 */

type ClientRow = typeof clients.$inferSelect;

function toClient(row: ClientRow): Client {
  return {
    id: row.id,
    merchantId: row.merchantId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listClients(db: Database, merchantId: string): Promise<Client[]> {
  const rows = await db
    .select()
    .from(clients)
    .where(eq(clients.merchantId, merchantId))
    .orderBy(desc(clients.createdAt));
  return rows.map(toClient);
}

export async function createClient(
  db: Database,
  merchantId: string,
  input: ClientInput,
): Promise<Client> {
  const [row] = await db
    .insert(clients)
    .values({
      merchantId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
    })
    .returning();
  if (!row) {
    throw new Error('failed to insert client');
  }
  return toClient(row);
}

export async function getClient(
  db: Database,
  merchantId: string,
  id: string,
): Promise<Client | null> {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.merchantId, merchantId)))
    .limit(1);
  return row ? toClient(row) : null;
}

export async function updateClient(
  db: Database,
  merchantId: string,
  id: string,
  patch: ClientUpdate,
): Promise<Client | null> {
  const set: Partial<Pick<ClientRow, 'name' | 'email' | 'phone' | 'notes'>> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.email !== undefined) set.email = patch.email;
  if (patch.phone !== undefined) set.phone = patch.phone;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (Object.keys(set).length === 0) {
    return getClient(db, merchantId, id);
  }
  const [row] = await db
    .update(clients)
    .set(set)
    .where(and(eq(clients.id, id), eq(clients.merchantId, merchantId)))
    .returning();
  return row ? toClient(row) : null;
}

export async function deleteClient(db: Database, merchantId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(clients)
    .where(and(eq(clients.id, id), eq(clients.merchantId, merchantId)))
    .returning({ id: clients.id });
  return rows.length > 0;
}
