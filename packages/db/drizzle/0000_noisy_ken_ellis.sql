CREATE TYPE "public"."generation_status" AS ENUM('queued', 'processing', 'succeeded', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."key_env" AS ENUM('test', 'live');--> statement-breakpoint
CREATE TYPE "public"."key_kind" AS ENUM('publishable', 'secret');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('purchase', 'grant', 'generation', 'refund', 'adjustment', 'expiry');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('free', 'starter', 'growth', 'scale', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('furniture', 'lighting', 'door', 'window', 'kitchen', 'bath', 'shower', 'tiles', 'mirror', 'decor', 'renovation', 'outdoor', 'fashion', 'other');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"kind" "key_kind" NOT NULL,
	"env" "key_env" NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid,
	"actor" text,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"generation_id" uuid,
	"stripe_ref" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"product_id" uuid,
	"status" "generation_status" DEFAULT 'queued' NOT NULL,
	"room_key" text NOT NULL,
	"product_snapshot" jsonb NOT NULL,
	"placement_hint" text,
	"idempotency_key" text NOT NULL,
	"result_key" text,
	"model" text,
	"credits_spent" integer DEFAULT 1 NOT NULL,
	"cost_cents" integer,
	"latency_ms" integer,
	"error_code" text,
	"anon_id" text,
	"page_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'owner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_merchant_user_uq" UNIQUE("merchant_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" "plan_tier" DEFAULT 'free' NOT NULL,
	"credits_balance" integer DEFAULT 0 NOT NULL,
	"allowed_domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"category" "product_category" DEFAULT 'other' NOT NULL,
	"image_url" text NOT NULL,
	"clean_image_key" text,
	"dimensions" jsonb,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_merchant_external_uq" UNIQUE("merchant_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"merchant_id" uuid PRIMARY KEY NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"plan" "plan_tier" DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"included_credits" integer DEFAULT 0 NOT NULL,
	"overage_meter" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"type" text NOT NULL,
	"product_id" uuid,
	"generation_id" uuid,
	"anon_id" text,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks_inbox" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"button_text" text DEFAULT 'Try in your room' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"i18n" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_cta" jsonb,
	"watermark" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_assets" ADD CONSTRAINT "generation_assets_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_configs" ADD CONSTRAINT "widget_configs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_merchant_idx" ON "api_keys" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_prefix_uidx" ON "api_keys" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "audit_merchant_idx" ON "audit_log" USING btree ("merchant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ledger_merchant_idx" ON "credit_ledger" USING btree ("merchant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gen_assets_gen_idx" ON "generation_assets" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "gen_merchant_created_idx" ON "generations" USING btree ("merchant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "gen_status_idx" ON "generations" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "gen_idem_uidx" ON "generations" USING btree ("merchant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "gen_product_idx" ON "generations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_merchant_idx" ON "products" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("merchant_id","category");--> statement-breakpoint
CREATE INDEX "usage_merchant_type_time_idx" ON "usage_events" USING btree ("merchant_id","type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "widget_active_uidx" ON "widget_configs" USING btree ("merchant_id") WHERE "widget_configs"."is_active";