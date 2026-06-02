import { eq, sql } from 'drizzle-orm';
import { merchants, subscriptions, webhooksInbox, type Database } from '@lumina/db';
import type { BillingEvent } from './types.js';

export interface ApplyResult {
  applied: boolean;
  reason?: 'duplicate';
}

/**
 * Apply a billing event: idempotently (deduped on `webhooks_inbox.id`) upsert the subscription, set the
 * merchant's plan, and grant the plan's included credits atomically via `grant_credits()`. Everything —
 * including the inbox insert — runs in ONE transaction, so a replay never double-grants (HARD RULE #3)
 * and a mid-failure rolls back cleanly for a safe retry.
 */
export async function applyBillingEvent(db: Database, evt: BillingEvent): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(webhooksInbox)
      .values({
        id: evt.id,
        source: 'stripe',
        payload: { type: evt.type, plan: evt.plan, merchantId: evt.merchantId },
      })
      .onConflictDoNothing()
      .returning({ id: webhooksInbox.id });
    if (inserted.length === 0) {
      return { applied: false, reason: 'duplicate' as const };
    }

    const isActive = evt.type === 'subscription_active';
    const status = isActive ? 'active' : 'canceled';

    await tx
      .insert(subscriptions)
      .values({
        merchantId: evt.merchantId,
        stripeCustomerId: evt.stripeCustomerId,
        stripeSubscriptionId: evt.stripeSubscriptionId,
        plan: evt.plan,
        status,
        includedCredits: evt.includedCredits,
        currentPeriodEnd: evt.currentPeriodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptions.merchantId,
        set: {
          stripeCustomerId: evt.stripeCustomerId,
          stripeSubscriptionId: evt.stripeSubscriptionId,
          plan: evt.plan,
          status,
          includedCredits: evt.includedCredits,
          currentPeriodEnd: evt.currentPeriodEnd,
          updatedAt: new Date(),
        },
      });

    await tx
      .update(merchants)
      .set({ plan: isActive ? evt.plan : 'free', updatedAt: new Date() })
      .where(eq(merchants.id, evt.merchantId));

    if (evt.grantCredits && evt.includedCredits > 0) {
      await tx.execute(
        sql`select grant_credits(${evt.merchantId}::uuid, ${evt.includedCredits}, 'grant', ${evt.id})`,
      );
    }

    await tx
      .update(webhooksInbox)
      .set({ processedAt: new Date() })
      .where(eq(webhooksInbox.id, evt.id));
    return { applied: true };
  });
}
