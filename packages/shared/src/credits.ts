import { z } from 'zod';
import { LedgerReasonSchema } from './enums.js';

/**
 * Credits view (§6.3 `/credits`). Balance + the append-only ledger (signed amounts: +grant / -debit),
 * with the plan's monthly allotment + usage for the meter. Merchant-scoped server-side.
 */
export const LedgerEntrySchema = z.object({
  id: z.string(),
  amount: z.number().int(),
  reason: LedgerReasonSchema,
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const CreditsResponseSchema = z.object({
  balance: z.number().int(),
  included: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  resetsAt: z.string().nullable(),
  ledger: z.array(LedgerEntrySchema),
});
export type CreditsResponse = z.infer<typeof CreditsResponseSchema>;
