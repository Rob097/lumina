ALTER TABLE "credit_ledger" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_account_idx" ON "credit_ledger" USING btree ("account_id","created_at" DESC NULLS LAST);--> statement-breakpoint

-- ============================================================================
-- Hand-authored (Phase 2 — shared credit pool). Credits move from the merchant to the account: the
-- denormalized balance is accounts.credits_balance (backfilled in 0016), and grant/debit now resolve
-- merchant -> account and write an account-scoped ledger row (merchant_id kept for attribution + RLS).
-- ============================================================================

-- Attribute every existing ledger row to its merchant's account.
UPDATE credit_ledger cl
   SET account_id = m.account_id
  FROM merchants m
 WHERE cl.merchant_id = m.id AND cl.account_id IS NULL;--> statement-breakpoint

-- debit_credits spends from the shared account pool when the merchant is linked; otherwise it falls
-- back to the merchant's own balance (pre-migration / un-linked rows). Same signature — callers unchanged.
CREATE OR REPLACE FUNCTION debit_credits(p_merchant uuid, p_amount int, p_gen uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_account uuid; new_balance int;
BEGIN
  SELECT account_id INTO v_account FROM merchants WHERE id = p_merchant;
  IF v_account IS NOT NULL THEN
    UPDATE accounts
       SET credits_balance = credits_balance - p_amount, updated_at = now()
     WHERE id = v_account AND credits_balance >= p_amount
     RETURNING credits_balance INTO new_balance;
    IF new_balance IS NULL THEN
      RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING errcode = 'P0001';
    END IF;
    INSERT INTO credit_ledger(account_id, merchant_id, amount, reason, generation_id)
    VALUES (v_account, p_merchant, -p_amount, 'generation', p_gen);
    RETURN new_balance;
  END IF;
  UPDATE merchants
     SET credits_balance = credits_balance - p_amount, updated_at = now()
   WHERE id = p_merchant AND credits_balance >= p_amount
   RETURNING credits_balance INTO new_balance;
  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING errcode = 'P0001';
  END IF;
  INSERT INTO credit_ledger(merchant_id, amount, reason, generation_id)
  VALUES (p_merchant, -p_amount, 'generation', p_gen);
  RETURN new_balance;
END $$;--> statement-breakpoint

-- grant_credits credits the shared account pool when linked; else the merchant's own balance.
CREATE OR REPLACE FUNCTION grant_credits(
  p_merchant uuid,
  p_amount   int,
  p_reason   ledger_reason,
  p_ref      text DEFAULT NULL
)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_account uuid; new_balance int;
BEGIN
  SELECT account_id INTO v_account FROM merchants WHERE id = p_merchant;
  IF v_account IS NOT NULL THEN
    UPDATE accounts
       SET credits_balance = credits_balance + p_amount, updated_at = now()
     WHERE id = v_account
     RETURNING credits_balance INTO new_balance;
    INSERT INTO credit_ledger(account_id, merchant_id, amount, reason, stripe_ref)
    VALUES (v_account, p_merchant, p_amount, p_reason, p_ref);
    RETURN new_balance;
  END IF;
  UPDATE merchants
     SET credits_balance = credits_balance + p_amount, updated_at = now()
   WHERE id = p_merchant
   RETURNING credits_balance INTO new_balance;
  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'MERCHANT_NOT_FOUND' USING errcode = 'P0002';
  END IF;
  INSERT INTO credit_ledger(merchant_id, amount, reason, stripe_ref)
  VALUES (p_merchant, p_amount, p_reason, p_ref);
  RETURN new_balance;
END $$;--> statement-breakpoint

-- Re-pin the search_path (CREATE OR REPLACE keeps the body; re-assert the hardening from 0004).
ALTER FUNCTION debit_credits(uuid, integer, uuid) SET search_path = public;--> statement-breakpoint
ALTER FUNCTION grant_credits(uuid, integer, ledger_reason, text) SET search_path = public;