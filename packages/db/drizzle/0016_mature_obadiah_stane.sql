CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"plan" "plan_tier" DEFAULT 'free' NOT NULL,
	"credits_balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_owner_user_id_unique" UNIQUE("owner_user_id")
);
--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "account_id" uuid;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- ============================================================================
-- Hand-authored (Phase 1 — account billing model). The `accounts` table is the billing entity that
-- owns one or more workspaces; this section wires the auth.users FK, backfills accounts for existing
-- owners, links each workspace to its owner's account, and adds RLS. (Like 0015 for invitations.)
-- ============================================================================

-- owner_user_id references the Supabase-managed auth.users (FK can't be modeled in Drizzle).
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;--> statement-breakpoint

-- One billing account per owner user. plan = the highest plan among that owner's workspaces (never
-- downgrade a paying customer); credits = the SUM of their workspaces' balances (lose nothing in the move).
INSERT INTO "accounts" ("owner_user_id", "plan", "credits_balance")
SELECT
  o.user_id,
  -- Cast plan::text so the literals below are plain strings, not enum labels. Postgres forbids using an
  -- enum value added via ALTER TYPE ADD VALUE (e.g. 'pro') in the same transaction it was added in; the
  -- cast avoids referencing the labels at all.
  (SELECT mc.plan FROM memberships mm JOIN merchants mc ON mc.id = mm.merchant_id
    WHERE mm.user_id = o.user_id AND mm.role = 'owner'
    ORDER BY (CASE mc.plan::text
      WHEN 'enterprise' THEN 6 WHEN 'scale' THEN 5 WHEN 'pro' THEN 4
      WHEN 'growth' THEN 3 WHEN 'starter' THEN 2 ELSE 1 END) DESC
    LIMIT 1),
  (SELECT COALESCE(SUM(mc.credits_balance), 0) FROM memberships mm JOIN merchants mc ON mc.id = mm.merchant_id
    WHERE mm.user_id = o.user_id AND mm.role = 'owner')
FROM (SELECT DISTINCT user_id FROM memberships WHERE role = 'owner') o
ON CONFLICT ("owner_user_id") DO NOTHING;--> statement-breakpoint

-- Point each workspace at its owner's account.
UPDATE merchants mc
   SET account_id = a.id
  FROM memberships mm
  JOIN accounts a ON a.owner_user_id = mm.user_id
 WHERE mm.merchant_id = mc.id AND mm.role = 'owner' AND mc.account_id IS NULL;--> statement-breakpoint

-- RLS: an account is readable by its owner or any member of one of its workspaces. Writes (plan/credits)
-- happen via the service role, which bypasses RLS — same posture as subscriptions/notifications.
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "accounts_tenant_read" ON "accounts" FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR id IN (SELECT account_id FROM merchants WHERE id IN (SELECT current_merchant_ids()))
  );--> statement-breakpoint
GRANT SELECT ON "accounts" TO authenticated;