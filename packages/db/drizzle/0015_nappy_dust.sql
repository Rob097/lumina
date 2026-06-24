ALTER TYPE "public"."member_role" ADD VALUE 'support';--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_merchant_idx" ON "invitations" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "invitations_token_idx" ON "invitations" USING btree ("token");--> statement-breakpoint

-- ── Hand-authored (Drizzle can't model auth.users FKs or RLS) ──

-- invited_by references the Supabase-managed auth.users table (cascade on user delete).
ALTER TABLE "invitations"
  ADD CONSTRAINT "invitations_invited_by_auth_users_fk"
  FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- RLS: a member may read their workspace's invites. Create/accept/revoke happen via the privileged API
-- (service role bypasses RLS) — so no INSERT/UPDATE/DELETE grant to `authenticated`.
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "invitations_tenant_read" ON "invitations" FOR SELECT
  USING (merchant_id IN (SELECT current_merchant_ids()));
--> statement-breakpoint
GRANT SELECT ON "invitations" TO authenticated;
