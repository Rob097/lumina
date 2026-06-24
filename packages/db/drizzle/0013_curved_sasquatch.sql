ALTER TABLE "generations" ADD COLUMN "thumb_key" text;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "room_purged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN "originals_purged_at" timestamp with time zone;