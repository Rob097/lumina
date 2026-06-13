CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_merchant_idx" ON "clients" USING btree ("merchant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- ── Hand-appended: tenant-isolation RLS for clients (mirrors products in 0001). The dashboard path
--    runs as `authenticated`; the privileged widget/API role bypasses RLS and scopes by merchant_id.
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "clients_tenant_read" ON "clients" FOR SELECT
  USING (merchant_id IN (SELECT current_merchant_ids()));--> statement-breakpoint
CREATE POLICY "clients_tenant_write" ON "clients" FOR ALL
  USING (merchant_id IN (SELECT current_merchant_ids()))
  WITH CHECK (merchant_id IN (SELECT current_merchant_ids()));--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "clients" TO authenticated;