-- =========================================================
-- 0001 — auth.users FK, tenant-isolation RLS, and SQL functions
-- (architecture §5.2 debit_credits + §5.3 RLS). Authored by hand: Drizzle does not model RLS,
-- policies, grants, cross-schema FKs, or plpgsql functions.
--
-- Target: Supabase (the `auth` schema, `auth.users`, and the `anon`/`authenticated`/`service_role`
-- roles already exist). The test harness pre-applies `test/sql/00_auth_shim.sql` to provide
-- Supabase-compatible equivalents so this migration applies unchanged on a bare Postgres.
-- =========================================================

-- memberships.user_id references the Supabase-managed auth.users table.
ALTER TABLE "memberships"
  ADD CONSTRAINT "memberships_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- Helper: the merchant ids the current authenticated user belongs to.
-- SECURITY DEFINER so the RLS policies can consult `memberships` without granting end users direct
-- read access to it.
CREATE OR REPLACE FUNCTION current_merchant_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT merchant_id FROM memberships WHERE user_id = auth.uid()
$$;
--> statement-breakpoint

-- Atomic, race-safe credit debit used by the API before enqueuing a job (§5.2).
-- Decrements the denormalized cache and appends a ledger row in one transaction; raises
-- INSUFFICIENT_CREDITS (SQLSTATE P0001) when the balance is too low.
CREATE OR REPLACE FUNCTION debit_credits(p_merchant uuid, p_amount int, p_gen uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE new_balance int;
BEGIN
  UPDATE merchants
     SET credits_balance = credits_balance - p_amount,
         updated_at = now()
   WHERE id = p_merchant AND credits_balance >= p_amount
   RETURNING credits_balance INTO new_balance;
  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING errcode = 'P0001';
  END IF;
  INSERT INTO credit_ledger(merchant_id, amount, reason, generation_id)
  VALUES (p_merchant, -p_amount, 'generation', p_gen);
  RETURN new_balance;
END $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
--> statement-breakpoint

-- =========================================================
-- Row-Level Security (dashboard path). The public widget API runs with a privileged role that
-- bypasses RLS and scopes every query by the merchant_id resolved from the validated site_key.
-- =========================================================

-- merchants (tenant column: id)
ALTER TABLE "merchants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "merchants_tenant_read" ON "merchants" FOR SELECT
  USING (id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
CREATE POLICY "merchants_tenant_write" ON "merchants" FOR ALL
  USING (id IN (SELECT current_merchant_ids()))
  WITH CHECK (id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "merchants" TO authenticated;
--> statement-breakpoint

-- products
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "products_tenant_read" ON "products" FOR SELECT
  USING (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
CREATE POLICY "products_tenant_write" ON "products" FOR ALL
  USING (merchant_id IN (SELECT current_merchant_ids()))
  WITH CHECK (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "products" TO authenticated;
--> statement-breakpoint

-- generations
ALTER TABLE "generations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "generations_tenant_read" ON "generations" FOR SELECT
  USING (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
CREATE POLICY "generations_tenant_write" ON "generations" FOR ALL
  USING (merchant_id IN (SELECT current_merchant_ids()))
  WITH CHECK (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "generations" TO authenticated;
--> statement-breakpoint

-- credit_ledger
ALTER TABLE "credit_ledger" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "credit_ledger_tenant_read" ON "credit_ledger" FOR SELECT
  USING (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
CREATE POLICY "credit_ledger_tenant_write" ON "credit_ledger" FOR ALL
  USING (merchant_id IN (SELECT current_merchant_ids()))
  WITH CHECK (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "credit_ledger" TO authenticated;
--> statement-breakpoint

-- usage_events
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "usage_events_tenant_read" ON "usage_events" FOR SELECT
  USING (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
CREATE POLICY "usage_events_tenant_write" ON "usage_events" FOR ALL
  USING (merchant_id IN (SELECT current_merchant_ids()))
  WITH CHECK (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "usage_events" TO authenticated;
--> statement-breakpoint

-- widget_configs
ALTER TABLE "widget_configs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "widget_configs_tenant_read" ON "widget_configs" FOR SELECT
  USING (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
CREATE POLICY "widget_configs_tenant_write" ON "widget_configs" FOR ALL
  USING (merchant_id IN (SELECT current_merchant_ids()))
  WITH CHECK (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "widget_configs" TO authenticated;