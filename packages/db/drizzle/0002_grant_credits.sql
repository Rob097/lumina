-- =========================================================
-- 0002 — grant_credits(): atomic, race-safe credit grant (the inverse of debit_credits).
-- Used by the Stripe webhook to grant a plan's included credits and by manual adjustments.
-- Bumps the denormalized cache and appends a ledger row in one transaction so the cache always
-- equals SUM(credit_ledger.amount). Webhook idempotency (no double-grant on replays) is enforced
-- upstream via webhooks_inbox.
-- =========================================================
CREATE OR REPLACE FUNCTION grant_credits(
  p_merchant uuid,
  p_amount   int,
  p_reason   ledger_reason,
  p_ref      text DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE new_balance int;
BEGIN
  UPDATE merchants
     SET credits_balance = credits_balance + p_amount,
         updated_at = now()
   WHERE id = p_merchant
   RETURNING credits_balance INTO new_balance;
  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'MERCHANT_NOT_FOUND' USING errcode = 'P0002';
  END IF;
  INSERT INTO credit_ledger(merchant_id, amount, reason, stripe_ref)
  VALUES (p_merchant, p_amount, p_reason, p_ref);
  RETURN new_balance;
END $$;