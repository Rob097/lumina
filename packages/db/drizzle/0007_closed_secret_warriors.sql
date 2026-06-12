CREATE TABLE "notification_prefs" (
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prefs_merchant_id_user_id_pk" PRIMARY KEY("merchant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint

-- ── Hand-authored (Drizzle can't model auth.users FKs, RLS, grants, or the Realtime publication) ──

-- user_id references the Supabase-managed auth.users table (cascade on user delete).
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "notification_prefs"
  ADD CONSTRAINT "notification_prefs_user_id_auth_users_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
--> statement-breakpoint

-- RLS: a member may read only their own rows. Writes happen via the privileged API (service role),
-- which bypasses RLS — so no INSERT/UPDATE/DELETE grant to `authenticated`. SELECT is granted so a
-- future client-side Realtime subscription (the table is in the publication below) works under RLS.
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "notifications_own_read" ON "notifications" FOR SELECT
  USING (user_id = auth.uid());
--> statement-breakpoint
GRANT SELECT ON "notifications" TO authenticated;
--> statement-breakpoint

ALTER TABLE "notification_prefs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "notification_prefs_own_read" ON "notification_prefs" FOR SELECT
  USING (user_id = auth.uid());
--> statement-breakpoint
GRANT SELECT ON "notification_prefs" TO authenticated;
--> statement-breakpoint

-- Push new notification rows to subscribed dashboard clients (mirrors 0003 for generations).
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
